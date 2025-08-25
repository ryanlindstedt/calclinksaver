# filename: deploy_backend.py

import boto3
import json
import time
import zipfile
import io
import random
import string

# ======================================================================================
# SCRIPT CONFIGURATION
# ======================================================================================
# Generate a unique suffix to prevent resource name collisions
UNIQUE_SUFFIX = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
BASE_NAME = "CalcLinkSaver"

# Define resource names
TABLE_NAME = f"{BASE_NAME}Estimates-{UNIQUE_SUFFIX}"
ROLE_NAME = f"{BASE_NAME}LambdaRole-{UNIQUE_SUFFIX}"
POLICY_NAME = f"{BASE_NAME}DynamoDBPolicy-{UNIQUE_SUFFIX}"
FUNCTION_NAME = f"{BASE_NAME}Function-{UNIQUE_SUFFIX}"
API_NAME = f"{BASE_NAME}API-{UNIQUE_SUFFIX}"

# Get AWS Region and Account ID from the environment
try:
    session = boto3.Session()
    AWS_REGION = session.region_name
    ACCOUNT_ID = boto3.client('sts').get_caller_identity().get('Account')
    if not AWS_REGION:
        raise Exception("AWS Region not found. Please ensure you are running this in an environment with AWS credentials configured, like CloudShell.")
except Exception as e:
    print(f"Error getting AWS configuration: {e}")
    exit(1)

print(f"🚀  Starting deployment in region: {AWS_REGION}")
print(f"🔖  Unique suffix for this deployment: {UNIQUE_SUFFIX}\n")

# Initialize boto3 clients
iam_client = boto3.client('iam')
dynamodb_client = boto3.client('dynamodb')
lambda_client = boto3.client('lambda')
apigateway_client = boto3.client('apigatewayv2')

# ======================================================================================
# LAMBDA FUNCTION HANDLER CODE
# ======================================================================================
# This is the Python code that will run in Lambda to handle API requests.
lambda_handler_code = """
import boto3
import json
import os

DYNAMODB_TABLE_NAME = os.environ.get('DYNAMODB_TABLE_NAME')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(DYNAMODB_TABLE_NAME)

def handler(event, context):
    try:
        http_method = event['requestContext']['http']['method']
        path = event['requestContext']['http']['path']

        # --- Route: GET /estimates ---
        if http_method == 'GET' and path == '/estimates':
            response = table.scan()
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(response.get('Items', []))
            }

        # --- Route: POST /estimates ---
        elif http_method == 'POST' and path == '/estimates':
            body = json.loads(event.get('body', '{}'))
            if not all(k in body for k in ['id', 'name', 'url', 'timestamp']):
                 return {'statusCode': 400, 'body': 'Missing required fields'}
            table.put_item(Item=body)
            return {'statusCode': 201, 'body': 'Estimate saved', 'headers': {'Access-Control-Allow-Origin': '*'}}


        # --- Route: DELETE /estimates/{id} ---
        elif http_method == 'DELETE' and '/estimates/' in path:
            path_parts = path.strip('/').split('/')
            if len(path_parts) == 2 and path_parts[1]:
                estimate_id = path_parts[1]
                table.delete_item(Key={'id': estimate_id})
                return {'statusCode': 204, 'body': '', 'headers': {'Access-Control-Allow-Origin': '*'}}
            else:
                return {'statusCode': 400, 'body': 'Invalid path for deleting a single estimate.'}

        # --- Route: DELETE /estimates (Clear All) ---
        elif http_method == 'DELETE' and path == '/estimates':
            items_to_delete = table.scan(ProjectionExpression="id").get('Items', [])
            if items_to_delete:
                with table.batch_writer() as batch:
                    for item in items_to_delete:
                        batch.delete_item(Key={'id': item['id']})
            return {'statusCode': 204, 'body': '', 'headers': {'Access-Control-Allow-Origin': '*'}}

        else:
            return {'statusCode': 404, 'body': 'Not Found'}

    except Exception as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)}),
            'headers': {'Access-Control-Allow-Origin': '*'}
        }
"""

def create_iam_role():
    """Creates the IAM Role and Policy for the Lambda function."""
    print("Step 1: Creating IAM Role and Policy...")

    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "lambda.amazonaws.com"},
            "Action": "sts:AssumeRole"
        }]
    }

    try:
        role_response = iam_client.create_role(
            RoleName=ROLE_NAME,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description="Allows Lambda function to call AWS services on your behalf"
        )
        role_arn = role_response['Role']['Arn']
        print(f"  ✅ IAM Role '{ROLE_NAME}' created.")

        # Define and attach the policy for DynamoDB access
        table_arn = f"arn:aws:dynamodb:{AWS_REGION}:{ACCOUNT_ID}:table/{TABLE_NAME}"
        policy_document = {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Action": [
                    "dynamodb:Scan",
                    "dynamodb:PutItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:BatchWriteItem"
                ],
                "Resource": table_arn
            }]
        }

        iam_client.put_role_policy(
            RoleName=ROLE_NAME,
            PolicyName=POLICY_NAME,
            PolicyDocument=json.dumps(policy_document)
        )
        print(f"  ✅ IAM Policy '{POLICY_NAME}' created and attached.")

        # Wait for the role to be fully propagated
        print("     Waiting for IAM propagation...")
        time.sleep(10)

        return role_arn
    except iam_client.exceptions.EntityAlreadyExistsException:
        print(f"  ⚠️  IAM Role '{ROLE_NAME}' already exists. Reusing it.")
        return f"arn:aws:iam::{ACCOUNT_ID}:role/{ROLE_NAME}"
    except Exception as e:
        print(f"  ❌ Error creating IAM role: {e}")
        raise

def create_dynamo_table():
    """Creates the DynamoDB table to store estimates."""
    print("\nStep 2: Creating DynamoDB Table...")
    try:
        dynamodb_client.create_table(
            TableName=TABLE_NAME,
            AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
            KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
            BillingMode='PAY_PER_REQUEST'
        )
        print(f"  ⏳ Waiting for table '{TABLE_NAME}' to become active...")
        waiter = dynamodb_client.get_waiter('table_exists')
        waiter.wait(TableName=TABLE_NAME)
        print(f"  ✅ DynamoDB Table '{TABLE_NAME}' is active.")
    except dynamodb_client.exceptions.ResourceInUseException:
        print(f"  ⚠️  Table '{TABLE_NAME}' already exists.")
    except Exception as e:
        print(f"  ❌ Error creating DynamoDB table: {e}")
        raise

def create_lambda_function(role_arn):
    """Creates and packages the Lambda function."""
    print("\nStep 3: Creating Lambda Function...")
    try:
        # Package the handler code into a zip file in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'a', zipfile.ZIP_DEFLATED, False) as zf:
            zf.writestr('lambda_function.py', lambda_handler_code)
        zip_buffer.seek(0)

        response = lambda_client.create_function(
            FunctionName=FUNCTION_NAME,
            Runtime='python3.9',
            Role=role_arn,
            Handler='lambda_function.handler',
            Code={'ZipFile': zip_buffer.read()},
            Timeout=15,
            Environment={
                'Variables': {
                    'DYNAMODB_TABLE_NAME': TABLE_NAME
                }
            }
        )
        function_arn = response['FunctionArn']

        print(f"  ⏳ Waiting for function '{FUNCTION_NAME}' to become active...")
        waiter = lambda_client.get_waiter('function_active_v2')
        waiter.wait(FunctionName=FUNCTION_NAME)
        print(f"  ✅ Lambda function '{FUNCTION_NAME}' created.")

        # Set a low concurrency limit to prevent runaway costs
        print(f"     Setting function concurrency limit...")
        lambda_client.put_function_concurrency(
            FunctionName=FUNCTION_NAME,
            ReservedConcurrentExecutions=2
        )
        print(f"  ✅ Concurrency limit set to 2.")

        return function_arn
    except lambda_client.exceptions.ResourceConflictException:
        print(f"  ⚠️  Lambda function '{FUNCTION_NAME}' already exists. Skipping.")
        return f"arn:aws:lambda:{AWS_REGION}:{ACCOUNT_ID}:function/{FUNCTION_NAME}"
    except Exception as e:
        print(f"  ❌ Error creating Lambda function: {e}")
        raise

def create_api_gateway(function_arn):
    """Creates the API Gateway and integrates it with the Lambda function."""
    print("\nStep 4: Creating API Gateway...")
    try:
        # Create the HTTP API
        api_response = apigateway_client.create_api(
            Name=API_NAME,
            ProtocolType='HTTP',
            CorsConfiguration={
                'AllowOrigins': ['*'],
                'AllowMethods': ['GET', 'POST', 'DELETE', 'OPTIONS'],
                'AllowHeaders': ['Content-Type', 'x-api-key'], # Allow the API key header
            }
        )
        api_id = api_response['ApiId']
        api_endpoint = api_response['ApiEndpoint']
        print(f"  ✅ API Gateway '{API_NAME}' created with endpoint: {api_endpoint}")

        # Create the Lambda integration
        integration_response = apigateway_client.create_integration(
            ApiId=api_id,
            IntegrationType='AWS_PROXY',
            IntegrationUri=function_arn,
            PayloadFormatVersion='2.0'
        )
        integration_id = integration_response['IntegrationId']
        print("  ✅ Lambda integration created.")

        # Define and create routes, requiring an API key
        routes = {
            'GET /estimates': 'estimates_get_all',
            'POST /estimates': 'estimates_post_one',
            'DELETE /estimates': 'estimates_delete_all',
            'DELETE /estimates/{id}': 'estimates_delete_one'
        }

        for route_key, _ in routes.items():
            apigateway_client.create_route(
                ApiId=api_id,
                RouteKey=route_key,
                Target=f'integrations/{integration_id}',
                ApiKeyRequired=True # Require an API key for all routes
            )
        print("  ✅ API routes created and configured to require an API key.")

        # Add permissions for API Gateway to invoke the Lambda function
        source_arn = f"arn:aws:execute-api:{AWS_REGION}:{ACCOUNT_ID}:{api_id}/*/*"
        lambda_client.add_permission(
            FunctionName=FUNCTION_NAME,
            StatementId=f'api-gateway-invoke-{UNIQUE_SUFFIX}',
            Action='lambda:InvokeFunction',
            Principal='apigateway.amazonaws.com',
            SourceArn=source_arn
        )
        print("  ✅ Granted API Gateway permission to invoke Lambda.")

        return api_id, f"{api_endpoint}/estimates"
    except Exception as e:
        print(f"  ❌ Error creating API Gateway: {e}")
        raise

def setup_api_security(api_id):
    """Creates an API Key and a Usage Plan for security and cost control."""
    print("\nStep 5: Setting up API Security and Usage Plan...")
    try:
        # Create an API Key
        key_response = apigateway_client.create_api_key(
            name=f'{BASE_NAME}-Key-{UNIQUE_SUFFIX}',
            description='API Key for the CalcLinkSaver Tampermonkey script',
            enabled=True,
        )
        api_key = key_response['value'] # This is the secret key
        api_key_id = key_response['id']
        print(f"  ✅ API Key created.")

        # Create a Usage Plan with throttling and a quota
        plan_response = apigateway_client.create_usage_plan(
            name=f'{BASE_NAME}-UsagePlan-{UNIQUE_SUFFIX}',
            description='Limits usage for the CalcLinkSaver API',
            throttle={
                'rateLimit': 10, # 10 requests per second
                'burstLimit': 5
            },
            quota={
                'limit': 5000, # 5000 requests per month
                'period': 'MONTH'
            },
            apiStages=[{
                'apiId': api_id,
                'stage': '$default' # The default stage for HTTP APIs
            }]
        )
        plan_id = plan_response['id']
        print(f"  ✅ Usage Plan created with a limit of 5000 requests/month.")

        # Associate the API Key with the Usage Plan
        apigateway_client.create_usage_plan_key(
            usagePlanId=plan_id,
            keyId=api_key_id,
            keyType='API_KEY'
        )
        print(f"  ✅ API Key associated with Usage Plan.")

        return api_key
    except Exception as e:
        print(f"  ❌ Error setting up API security: {e}")
        raise

if __name__ == "__main__":
    try:
        role_arn = create_iam_role()
        create_dynamo_table()
        function_arn = create_lambda_function(role_arn)
        api_id, final_url = create_api_gateway(function_arn)
        api_key = setup_api_security(api_id)

        print("\n" + "="*60)
        print("🎉 SUCCESS! Your AWS backend has been deployed. 🎉")
        print("="*60)
        print("\nCopy the following URL and API KEY into your Tampermonkey script:\n")
        print(f"  ➡️   URL: {final_url}")
        print(f"  🔑   API Key: {api_key}\n")

    except Exception as e:
        print("\n" + "="*60)
        print("🔥 DEPLOYMENT FAILED 🔥")
        print(f"An error occurred: {e}")
        print("Please check the error messages above. You may need to manually clean up created resources from the AWS console.")
        print("="*60)
