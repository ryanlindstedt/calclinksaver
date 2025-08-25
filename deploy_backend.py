# filename: deploy_backend.py (v3 - Corrected with REST API)

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
API_STAGE_NAME = "prod"

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
apigateway_client = boto3.client('apigateway')


# ======================================================================================
# LAMBDA FUNCTION HANDLER CODE (for REST API event format)
# ======================================================================================
lambda_handler_code = """
import boto3
import json
import os

DYNAMODB_TABLE_NAME = os.environ.get('DYNAMODB_TABLE_NAME')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(DYNAMODB_TABLE_NAME)

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,DELETE'
}

def handler(event, context):
    try:
        http_method = event['httpMethod']
        path = event['path']

        # Handle CORS preflight requests
        if http_method == 'OPTIONS':
            return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

        # --- Route: GET /estimates ---
        if http_method == 'GET' and path == '/estimates':
            response = table.scan()
            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': json.dumps(response.get('Items', []))
            }

        # --- Route: POST /estimates ---
        elif http_method == 'POST' and path == '/estimates':
            body = json.loads(event.get('body', '{}'))
            if not all(k in body for k in ['id', 'name', 'url', 'timestamp']):
                 return {'statusCode': 400, 'headers': CORS_HEADERS, 'body': 'Missing required fields'}
            table.put_item(Item=body)
            return {'statusCode': 201, 'headers': CORS_HEADERS, 'body': 'Estimate saved'}

        # --- Route: DELETE /estimates/{id} ---
        elif http_method == 'DELETE' and event.get('pathParameters') and 'id' in event['pathParameters']:
            estimate_id = event['pathParameters']['id']
            table.delete_item(Key={'id': estimate_id})
            return {'statusCode': 204, 'headers': CORS_HEADERS, 'body': ''}

        # --- Route: DELETE /estimates (Clear All) ---
        elif http_method == 'DELETE' and path == '/estimates':
            items_to_delete = table.scan(ProjectionExpression="id").get('Items', [])
            if items_to_delete:
                with table.batch_writer() as batch:
                    for item in items_to_delete:
                        batch.delete_item(Key={'id': item['id']})
            return {'statusCode': 204, 'headers': CORS_HEADERS, 'body': ''}

        else:
            return {'statusCode': 404, 'headers': CORS_HEADERS, 'body': 'Not Found'}

    except Exception as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
"""

def create_iam_role():
    """Creates the IAM Role and Policy for the Lambda function."""
    print("Step 1: Creating IAM Role and Policy...")
    trust_policy = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]
    })
    try:
        role_response = iam_client.create_role(RoleName=ROLE_NAME, AssumeRolePolicyDocument=trust_policy)
        role_arn = role_response['Role']['Arn']
        print(f"  ✅ IAM Role '{ROLE_NAME}' created.")

        table_arn = f"arn:aws:dynamodb:{AWS_REGION}:{ACCOUNT_ID}:table/{TABLE_NAME}"
        policy_document = json.dumps({
            "Version": "2012-10-17",
            "Statement": [{"Effect": "Allow", "Action": ["dynamodb:Scan", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:BatchWriteItem"], "Resource": table_arn}]
        })
        iam_client.put_role_policy(RoleName=ROLE_NAME, PolicyName=POLICY_NAME, PolicyDocument=policy_document)
        print(f"  ✅ IAM Policy '{POLICY_NAME}' created and attached.")
        print("     Waiting for IAM propagation...")
        time.sleep(10)
        return role_arn
    except iam_client.exceptions.EntityAlreadyExistsException:
        print(f"  ⚠️  IAM Role '{ROLE_NAME}' already exists. Reusing.")
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
            Environment={'Variables': {'DYNAMODB_TABLE_NAME': TABLE_NAME}}
        )
        function_arn = response['FunctionArn']
        waiter = lambda_client.get_waiter('function_active_v2')
        waiter.wait(FunctionName=FUNCTION_NAME)
        print(f"  ✅ Lambda function '{FUNCTION_NAME}' created.")
        return function_arn
    except lambda_client.exceptions.ResourceConflictException:
        print(f"  ⚠️  Lambda function '{FUNCTION_NAME}' already exists. Skipping.")
        return f"arn:aws:lambda:{AWS_REGION}:{ACCOUNT_ID}:function/{FUNCTION_NAME}"
    except Exception as e:
        print(f"  ❌ Error creating Lambda function: {e}")
        raise

def create_api_gateway(function_arn):
    """Creates the REST API Gateway and integrates it with the Lambda function."""
    print("\nStep 4: Creating REST API Gateway...")
    try:
        # Create the REST API
        api_response = apigateway_client.create_rest_api(name=API_NAME)
        api_id = api_response['id']
        print(f"  ✅ REST API '{API_NAME}' created with ID: {api_id}")

        # Get the root resource ID
        root_resource_id = apigateway_client.get_resources(restApiId=api_id)['items'][0]['id']

        # Create the /estimates resource
        estimates_resource = apigateway_client.create_resource(restApiId=api_id, parentId=root_resource_id, pathPart='estimates')
        estimates_resource_id = estimates_resource['id']

        # Create the /{id} resource
        id_resource = apigateway_client.create_resource(restApiId=api_id, parentId=estimates_resource_id, pathPart='{id}')
        id_resource_id = id_resource['id']

        # Lambda Integration URI
        lambda_uri = f"arn:aws:apigateway:{AWS_REGION}:lambda:path/2015-03-31/functions/{function_arn}/invocations"

        # --- Setup Methods and Integrations ---
        resources = {
            estimates_resource_id: ['GET', 'POST', 'DELETE', 'OPTIONS'],
            id_resource_id: ['DELETE', 'OPTIONS']
        }
        for resource_id, methods in resources.items():
            for method in methods:
                apigateway_client.put_method(
                    restApiId=api_id,
                    resourceId=resource_id,
                    httpMethod=method,
                    authorizationType='NONE',
                    apiKeyRequired=False if method == 'OPTIONS' else True
                )
                apigateway_client.put_integration(
                    restApiId=api_id,
                    resourceId=resource_id,
                    httpMethod=method,
                    type='AWS_PROXY',
                    integrationHttpMethod='POST',
                    uri=lambda_uri
                )
        print("  ✅ API Methods and Integrations created.")

        # Deploy the API
        apigateway_client.create_deployment(restApiId=api_id, stageName=API_STAGE_NAME)
        print(f"  ✅ API deployed to stage '{API_STAGE_NAME}'.")

        # Grant Lambda permission
        source_arn = f"arn:aws:execute-api:{AWS_REGION}:{ACCOUNT_ID}:{api_id}/*/*/*"
        lambda_client.add_permission(
            FunctionName=FUNCTION_NAME,
            StatementId=f'api-gateway-invoke-{UNIQUE_SUFFIX}',
            Action='lambda:InvokeFunction',
            Principal='apigateway.amazonaws.com',
            SourceArn=source_arn
        )
        print("  ✅ Granted API Gateway permission to invoke Lambda.")

        final_url = f"https://{api_id}.execute-api.{AWS_REGION}.amazonaws.com/{API_STAGE_NAME}/estimates"
        return api_id, final_url
    except Exception as e:
        print(f"  ❌ Error creating API Gateway: {e}")
        raise

def setup_api_security(api_id):
    """Creates an API Key and a Usage Plan for the REST API."""
    print("\nStep 5: Setting up API Security and Usage Plan...")
    try:
        key_response = apigateway_client.create_api_key(
            name=f'{BASE_NAME}-Key-{UNIQUE_SUFFIX}',
            description='API Key for the CalcLinkSaver Tampermonkey script',
            enabled=True,
        )
        api_key = key_response['value']
        api_key_id = key_response['id']
        print(f"  ✅ API Key created.")

        plan_response = apigateway_client.create_usage_plan(
            name=f'{BASE_NAME}-UsagePlan-{UNIQUE_SUFFIX}',
            description='Limits usage for the CalcLinkSaver API',
            apiStages=[{'apiId': api_id, 'stage': API_STAGE_NAME}],
            throttle={'rateLimit': 10, 'burstLimit': 5},
            quota={'limit': 5000, 'period': 'MONTH'}
        )
        plan_id = plan_response['id']
        print(f"  ✅ Usage Plan created with a limit of 5000 requests/month.")

        apigateway_client.create_usage_plan_key(usagePlanId=plan_id, keyId=api_key_id, keyType='API_KEY')
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
