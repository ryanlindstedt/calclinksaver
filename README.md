# CalcLinkSaver

**CalcLinkSaver** is a UserScript that enhances the AWS Pricing Calculator by allowing you to save, manage, and download your estimates. It offers two modes for data storage: a simple, zero-configuration local storage option, and a more robust, persistent backend powered by your own AWS account.

*\<p align="center"\>CalcLinkSaver adds a convenient button to the AWS Calculator page.\</p\>*

-----

## Features

  * **Effortless Saving**: Automatically saves an estimate when you click the "Copy public link" button in the "Save and Share" modal.
  * **Centralized Management**: A clean, accessible modal to view all your saved estimates in a sortable table.
  * **Quick Actions**: Easily copy estimate URLs to your clipboard, open them in a new tab, or delete them.
  * **Data Export**: Download all your saved estimates into a single CSV file for offline use or record-keeping.
  * **Flexible Storage**:
      * **Local Storage Mode**: The default mode, which requires no setup. Your data is stored directly in your browser.
      * **AWS Backend Mode**: An optional, secure backend that uses your own AWS account for persistent storage. This allows you to access your saved estimates across different browsers or computers.
  * **Easy Configuration**: Switch between storage modes and configure your AWS backend through a simple menu command.

-----

## Screenshots

*\<p align="center"\>View, manage, and export all your saved estimates in one place.\</p\>*

*\<p align="center"\>A notification confirms that your estimate has been saved.\</p\>*

-----

## Installation

1.  **Install a UserScript Manager**: You need a browser extension to run UserScripts. [Tampermonkey](https://www.tampermonkey.net/) is recommended.

2.  **Install CalcLinkSaver**: Click the link below to install the script. Your UserScript manager should prompt you to confirm the installation.

    **[Install CalcLinkSaver.user.js](https://github.com/ryanlindstedt/calclinksaver/raw/refs/heads/main/CalcLinkSaver.user.js)**

-----

## Usage

1.  Navigate to the [AWS Pricing Calculator](https://calculator.aws/).
2.  Create or load an estimate.
3.  Click the **Share** button at the top right, which opens the "Save estimate" modal.
4.  Click the **Copy public link** button. The script will automatically capture the name, annual cost, and URL, and save it.
5.  Click the **CalcLinkSaver** button on the bottom right of the page at any time to open the management modal.

-----

## Configuration

The script works out-of-the-box using your browser's local storage. If you want to use the persistent AWS backend, you'll need to configure it.

1.  Click on the Tampermonkey extension icon in your browser.
2.  Select **Configure CalcLinkSaver AWS backend**.
3.  You will be prompted to enter an **API Gateway URL** and an **API Key**.

*\<p align="center"\>The configuration menu is accessible via your UserScript manager.\</p\>*

To get these credentials, you must deploy the backend to your own AWS account.

-----

## Optional: AWS Backend Deployment

Deploying the backend creates a serverless infrastructure (API Gateway, Lambda, DynamoDB) in your AWS account to securely store your estimates.

### Prerequisites

  * An AWS account.
  * Python 3.9+ installed.
  * [Boto3](https://boto3.amazonaws.com/v1/documentation/api/latest/guide/quickstart.html) library installed (`pip install boto3`).
  * Your AWS credentials configured in your environment (e.g., by using the AWS CLI `aws configure` command).

### Deployment Steps

1.  Download the `deploy_backend.py` script from this repository.
2.  Run the script from your terminal:
    ```bash
    python deploy_backend.py
    ```
3.  The script will provision the necessary AWS resources and, upon completion, output the **URL** and **API Key**.
4.  Copy and paste these values into the script's configuration prompts as described above.

-----

## License

This project is licensed under the MIT License. See the [LICENSE](https://www.google.com/search?q=LICENSE) file for details.
