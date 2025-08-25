# CalcLinkSaver: Save and Sync Your AWS Calculator Estimates

CalcLinkSaver is a powerful Tampermonkey userscript that enhances the AWS Calculator by allowing you to save, manage, and sync your estimate links. It operates in two modes: a simple **Local Storage** mode for quick, browser-based saving, and a powerful **AWS Backend** mode that syncs your saved estimates across different browsers and computers.

The project includes a Python deployment script (`deploy_backend.py`) that automatically provisions all the necessary, secure, and cost-effective AWS resources for the backend mode.

## ✨ Features

  * **One-Click Saving**: Automatically saves your estimate link when you click the "Copy public link" button in the AWS Calculator.
  * **Dual Storage Modes**:
      * **Local Storage Mode**: The default, zero-setup mode. Data is stored directly in your browser.
      * **AWS Backend Mode**: Sync your estimates across any browser where you have the script installed.
  * **Easy Management**: A clean, intuitive modal interface to view, open, and delete your saved estimates.
  * **Data Export**: Download all your saved estimate data as a CSV file with a single click.
  * **Automated Backend Deployment**: A Python script provisions a secure, serverless backend (API Gateway, Lambda, DynamoDB) in your own AWS account.
  * **Secure & Cost-Effective**: The backend is secured with an API key and has a generous usage plan to stay within the AWS Free Tier for most users.

-----

## 🔧 Installation and Setup

You can choose the simple local mode or the more powerful AWS backend mode.

### Prerequisites

  * A browser with the [Tampermonkey](https://www.tampermonkey.net/) extension installed.
  * **For AWS Backend Mode only**:
      * An AWS account with programmatic access (credentials configured for the AWS CLI, an EC2 instance role, or CloudShell).
      * Python 3.7+ and Boto3 (`pip install boto3`).

-----

### Mode 1: Local Storage (Simple)

This is the quickest way to get started. Your data will be saved only in your current browser.

1.  **Install the Script**:
      * Open the `CalcLinkSaver-2.0.user.js` file.
      * Copy its entire content.
      * Open the Tampermonkey dashboard in your browser, click the `+` tab to create a new script, and paste the code.
      * Press Ctrl+S or File \> Save.
2.  **Verify**:
      * Navigate to the [AWS Calculator](https://calculator.aws/).
      * You should see a floating orange button with a `📑` icon in the bottom-left corner. You're all set\!

-----

### Mode 2: AWS Backend (for Syncing)

This mode deploys a serverless backend into your own AWS account, allowing you to access your saved links from anywhere.

#### Step 1: Install the Tampermonkey Script

Follow **Step 1** from the "Local Storage" instructions above. We will configure it after deploying the backend.

#### Step 2: Deploy the AWS Backend

This is done using the provided `deploy_backend.py` script. It will automatically create all the necessary resources.

1.  **Configure AWS Credentials**: Make sure your environment is configured to interact with your AWS account. The easiest way is to use [AWS CloudShell](https://aws.amazon.com/cloudshell/), which has everything pre-configured.

2.  **Install Boto3**: If not already installed, open your terminal or command prompt and run:

    ```bash
    pip install boto3
    ```

3.  **Run the Deployment Script**: Navigate to the directory containing `deploy_backend.py` and run it:

    ```bash
    python deploy_backend.py
    ```

4.  **Copy the Output**: The script will take a minute or two to provision the resources. Upon success, it will print the **API Gateway URL** and the **API Key**.

    ```text
    ============================================================
    🎉 SUCCESS! Your AWS backend has been deployed. 🎉
    ============================================================

    Copy the following URL and API KEY into your Tampermonkey script:

      ➡️   URL: https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/estimates
      🔑   API Key: AbcdeFGHIJKLMnopq12345...
    ```

#### Step 3: Configure the Userscript

1.  Open the Tampermonkey editor for the CalcLinkSaver script.

2.  Find the `SCRIPT CONFIGURATION` section at the top.

3.  Paste the **URL** and **API Key** from the script's output into the `API_GATEWAY_URL` and `API_KEY` constants.

    ```javascript
    // SCRIPT CONFIGURATION
    const API_GATEWAY_URL = 'https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/estimates'; // 👈 Paste URL here
    const API_KEY = 'AbcdeFGHIJKLMnopq12345...'; // 👈 Paste API Key here
    ```

4.  Save the script (Ctrl+S). The script will now automatically use your AWS backend.

-----

## 💻 How to Use

1.  **Saving an Estimate**:

      * After creating an estimate in the AWS Calculator, click the "Save and share" button.
      * In the modal that appears, click the **"Copy public link" button**.
      * The script will automatically intercept this action, saving the link, its title, and a timestamp. A confirmation pop-up `✅ Estimate Saved!` will appear.

2.  **Managing Estimates**:

      * Click the floating `📑` button on the bottom-left of the page.
      * This opens the **Saved AWS Estimates** modal, where you can:
          * See all your saved links, sorted by most recent.
          * Open a link in a new tab.
          * Delete individual estimates.
          * **Download CSV**: Export all your saved data.
          * **Clear All**: Permanently delete all saved estimates.

-----

## 🏗️ Backend Architecture

The `deploy_backend.py` script creates a robust, serverless stack using the following AWS services:

  * **Amazon API Gateway (HTTP API)**: Provides a secure HTTP endpoint. It requires an API key for all requests and is configured with CORS to be accessible from the browser.
  * **AWS Lambda**: The core of the backend logic. A single Python function routes requests from the API Gateway to perform actions (get, create, delete).
  * **Amazon DynamoDB**: A NoSQL database used to store the estimate data. It is configured in on-demand mode, so you only pay for what you use.
  * **AWS IAM**: An IAM Role and Policy are created to grant the Lambda function the precise permissions it needs to access the DynamoDB table (principle of least privilege).
  * **API Gateway Usage Plan**: To prevent unexpected costs, a usage plan is created that throttles requests and sets a monthly quota (default is 5,000 requests/month), which is well within the free tier.

The flow is as follows:
**Userscript** → **API Gateway** → **Lambda** → **DynamoDB**

-----

## 🗑️ Cleaning Up / Uninstalling the Backend

If you no longer need the AWS backend, you can easily remove all created resources to ensure you don't incur any costs.

1.  Find the **Unique Suffix** that was generated when you ran the deployment script. It will be in the names of all the created resources (e.g., `CalcLinkSaverEstimates-abcdef`).
2.  Navigate to the AWS Console and delete the following resources (the order is recommended):
      * **API Gateway**: Delete the API named `CalcLinkSaverAPI-<suffix>`.
      * **Lambda**: Delete the function named `CalcLinkSaverFunction-<suffix>`.
      * **IAM**: Delete the role named `CalcLinkSaverLambdaRole-<suffix>`.
      * **DynamoDB**: Delete the table named `CalcLinkSaverEstimates-<suffix>`.

-----

## 📜 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
