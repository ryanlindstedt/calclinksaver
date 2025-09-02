# CalcLinkSaver
CalcLinkSaver is a browser userscript for saving, managing, and downloading AWS Calculator estimates. It is designed for professionals who frequently create and manage multiple AWS cost estimates. It can operate in two modes: a simple **Local Storage mode** (zero setup) or a robust **AWS Backend mode** for persistent, secure storage.

## Features
- Save AWS Calculator links with one click.
- Automatically captures the estimate name and annual cost.
- Clean, intuitive UI for viewing, copying, and opening saved links.
- Option to download all saved estimates as a CSV file.
- Dual-mode operation:
    - **Local Storage Mode:** No configuration needed. Data is stored in the browser.
    - **AWS Backend Mode:** Securely stores data in your own AWS account using a serverless backend (API Gateway, Lambda, DynamoDB).
- Simple backend deployment using a single Python script.

## Screenshots
<p align="center">
<img src="screenshots/normal%20view.png" alt="The configuration menu is accessible via your UserScript manager" width="600"><br />
CalcLinkSaver adds a convenient button to the AWS Calculator page.
</p>
<p align="center">
<img src="screenshots/pop%20up%20table.png" alt="View, manage, and export all your saved estimates in one placer" width="600"><br />
View, manage, and export all your saved estimates in one place.
</p>
<p align="center">
<img src="screenshots/save%20link.png" alt="The configuration menu is accessible via your UserScript manager" width="600"><br />
Clicking the Share Link button copy the link to clipboard and also saves it to CalcLinkSaver.
</p>
<p align="center">
<img src="screenshots/estimate%20saved.png" alt="A notification confirms that your estimate has been saved" width="600"><br />
A notification confirms that your estimate has been saved.
</p>

## Prerequisites
- A browser with a userscript manager like [Tampermonkey](https://www.tampermonkey.net/) installed.
- **Optional AWS backend Mode**: An AWS account with credentials configured in your environment (e.g., in AWS CloudShell).
### What are Tampermonkey and Greasemonkey?

Tampermonkey (for Chrome/Safari/Edge/Opera) and Greasemonkey (for Firefox) are popular browser extensions known as **userscript managers**. They allow you to install "userscripts"—small snippets of JavaScript—that can modify the appearance and behavior of specific websites.

This is a safe and secure way to enhance your browsing experience for several reasons:
  * **Transparency**: You can see the script and the exact code it is using as opposed to a closed source native browser extension.
  * **User Control**: You must explicitly approve the installation of any userscript. You can review the code and disable or remove any script at any time.
  * **Permission Model**: Scripts must declare their intentions upfront. Upon installation, the userscript manager will show you exactly what a script can do. For example, CalcLinkSaver declares:
      * It should only run on the AWS Calculator website (`@match https://calculator.aws/*`).
      * The specific browser functions it needs access to (e.g., `@grant GM_setValue` to save data).
      * The external domains it needs to connect to for the AWS backend (`@connect amazonaws.com`).
  * **Sandboxed Environment**: Scripts are executed in a controlled environment, preventing them from interfering with your browser or other websites you visit.


## Installation & Configuration
### Step 1: Install the Userscript
1. Install the [Tampermonkey browser extension](https://www.tampermonkey.net/).
2. Click on the following link to install the script: [Install CalcLinkSaver.user.js](https://github.com/ryanlindstedt/calclinksaver/raw/refs/heads/main/CalcLinkSaver.user.js).
3. Tampermonkey will open a new tab with the script's contents. Click the "Install" button.
4. Some browsers will need additional security permissions. See Tampermonkey FAQ for [Chrome based (including Edge)](https://www.tampermonkey.net/faq.php#Q209).
5. CalcLinkSaver should now show up on [calculator.aws](https://calculator.aws/).


### Step 2: Choose your Mode
By default, the script works in **Local Storage mode**. No further configuration is needed.
To enable the **AWS Backend mode**, you must first deploy the backend and then configure the script.

### Step 3: Optional: Configure for AWS Backend
1. Deploy the AWS backend (see below).
2. Click on the Tampermonkey extension icon in your browser. 
3. Select "Configure CalcLinkSaver AWS backend".
4. You will be prompted to enter an **API Gateway URL** and an **API Key**. You will get these values from the backend deployment step.
## The AWS Backend: Deployment and Architecture
The backend is an entirely serverless architecture deployed into your own AWS account for maximum security and control.

### Architecture Overview
The `deploy_backend.py` script creates the following resources:
- **Amazon API Gateway:** Provides a RESTful API endpoint to receive requests from the userscript.
- **AWS Lambda:** A Python function that contains the core logic for interacting with the database.
- **Amazon DynamoDB:** A NoSQL database table to store the saved estimate links.
- **AWS IAM:** An IAM Role and Policy to grant the Lambda function the necessary permissions to access the DynamoDB table.
- **API Key & Usage Plan:** Secures the API endpoint and throttles requests to prevent abuse.

### Deployment Steps
1. It's recommended to run this script from **AWS CloudShell** for a seamless experience with pre-configured credentials.
2. Download the `deploy_backend.py` script from this repository.
3. Run the script from your terminal:
    Bash
    
    ```
    python deploy_backend.py
    ```
4. The script will automatically create all the necessary resources and output the `URL` and `API Key`.
5. Save this output to configure the userscript.

## Uninstalling the AWS Backend
To completely remove the resources created by the deployment script, log into the AWS Console and delete the following resources. They are named with a unique suffix generated during deployment:
- The **API Gateway** (`CalcLinkSaverAPI-<suffix>`)
- The **Lambda Function** (`CalcLinkSaverFunction-<suffix>`)
- The **DynamoDB Table** (`CalcLinkSaverEstimates-<suffix>`)
- The **IAM Role** (`CalcLinkSaverLambdaRole-<suffix>`)
## License

This project is licensed under the **MIT License**.
