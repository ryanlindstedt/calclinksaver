// ==UserScript==
// @name         CalcLinkSaver
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Save, manage, and download AWS Calculator estimates with an optional AWS backend or local storage fallback.
// @author       Ryan Lindstedt
// @match        https://calculator.aws/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      mazonaws.com
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // SCRIPT CONFIGURATION
    // =========================================================================
    // To enable AWS Backend Mode:
    // 1. Run the deploy_backend.py script.
    // 2. Paste the URL and API Key it provides below.
    // To use Local Storage Mode (Default), leave both strings empty ('').
    const API_GATEWAY_URL = ''; // e.g., 'https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/estimates'
    const API_KEY = '';         // e.g., 'AbcdeFGHIJKLMnopq12345...'


    // =========================================================================
    // SCRIPT CONSTANTS & STATE
    // =========================================================================
    const useAWSBackend = API_GATEWAY_URL !== '' && API_KEY !== '';
    const STORAGE_KEY = 'aws_saved_estimates_v2';


    // =========================================================================
    // STYLING (CSS)
    // =========================================================================
    GM_addStyle(`
        /* --- Pop-up Notification --- */
        .cls2-popup-notification {
            position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(35, 47, 62, 0.95); color: #ffffff;
            padding: 40px 60px; border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.4);
            z-index: 99999; font-size: 28px; font-weight: bold;
            opacity: 0; transition: opacity 0.4s ease, transform 0.4s ease;
            transform: translate(-50%, -60%);
        }
        .cls2-popup-notification.show { opacity: 1; transform: translate(-50%, -50%); }

        /* --- Floating Action Button --- */
        .cls2-fab {
            position: fixed; bottom: 30px; left: 30px; width: 56px; height: 56px;
            background-color: #ff9900; color: #232f3e; border-radius: 50%;
            border: none; box-shadow: 0 4px 10px rgba(0,0,0,0.25);
            font-size: 28px; display: flex; align-items: center;
            justify-content: center; cursor: pointer; z-index: 99998;
            transition: transform 0.2s ease;
        }
        .cls2-fab:hover { transform: scale(1.05); }

        /* --- Main Modal --- */
        .cls2-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.6); z-index: 100000;
            display: none; align-items: center; justify-content: center;
        }
        .cls2-modal-overlay.visible { display: flex; }
        .cls2-modal-content {
            background-color: #ffffff; color: #232f3e; padding: 24px;
            border-radius: 8px; width: 90%; max-width: 800px;
            max-height: 80vh; display: flex; flex-direction: column;
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
        }
        .cls2-modal-header {
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid #e0e0e0; padding-bottom: 16px; margin-bottom: 16px;
        }
        .cls2-modal-header h2 { margin: 0; font-size: 20px; }
        .cls2-modal-close {
            font-size: 28px; font-weight: bold; line-height: 1;
            cursor: pointer; border: none; background: none; color: #545b64;
        }
        .cls2-modal-body { overflow-y: auto; flex-grow: 1; }
        .cls2-links-table { width: 100%; border-collapse: collapse; }
        .cls2-links-table th, .cls2-links-table td {
            padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0;
        }
        .cls2-links-table th { font-weight: bold; background-color: #fafafa; }
        .cls2-links-table td a { color: #0073bb; text-decoration: none; word-break: break-all; }
        .cls2-links-table td a:hover { text-decoration: underline; }
        .cls2-link-item-delete {
            background: #d13212; color: white; border: none; border-radius: 4px;
            padding: 6px 10px; font-size: 12px; cursor: pointer; flex-shrink: 0;
        }
        .cls2-modal-footer {
            margin-top: 20px; padding-top: 16px; border-top: 1px solid #e0e0e0;
            display: flex; justify-content: space-between; align-items: center; gap: 10px;
        }
        .cls2-footer-btn {
            border: none; border-radius: 4px; padding: 8px 16px;
            cursor: pointer; font-weight: bold;
        }
        .cls2-download-all { background: #0073bb; color: white; }
        .cls2-clear-all { background: #d13212; color: white; }
        .cls2-backend-status { font-size: 12px; color: #545b64; }
    `);


    // =========================================================================
    // DATA HANDLING LOGIC (Abstracted for AWS Backend or Local Storage)
    // =========================================================================
    const dataHandler = {
        /**
         * Fetches all saved estimates.
         * @returns {Promise<Array>} A promise that resolves to an array of estimate objects.
         */
        getLinks: () => new Promise((resolve, reject) => {
            if (useAWSBackend) {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: API_GATEWAY_URL,
                    headers: { 'x-api-key': API_KEY },
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            resolve(JSON.parse(res.responseText));
                        } else {
                            reject(res);
                        }
                    },
                    onerror: (err) => {
                        console.error('AWS Backend Error (GET):', err);
                        alert('Error: Could not fetch links from the backend. Check console for details.');
                        reject(err);
                    }
                });
            } else {
                resolve(GM_getValue(STORAGE_KEY, []));
            }
        }),

        /**
         * Saves a new estimate object.
         * @param {object} newLink - The estimate object to save.
         * @returns {Promise<void>}
         */
        saveLink: (newLink) => new Promise(async (resolve, reject) => {
            if (useAWSBackend) {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: API_GATEWAY_URL,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': API_KEY
                    },
                    data: JSON.stringify(newLink),
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            resolve();
                        } else {
                            reject(res);
                        }
                    },
                    onerror: (err) => {
                        console.error('AWS Backend Error (POST):', err);
                        alert('Error: Could not save link to the backend. Check console for details.');
                        reject(err);
                    }
                });
            } else {
                const links = await GM_getValue(STORAGE_KEY, []);
                links.push(newLink);
                await GM_setValue(STORAGE_KEY, links);
                resolve();
            }
        }),

        /**
         * Deletes an estimate by its ID.
         * @param {string} id - The unique ID of the estimate to delete.
         * @returns {Promise<void>}
         */
        deleteLink: (id) => new Promise(async (resolve, reject) => {
            if (useAWSBackend) {
                GM_xmlhttpRequest({
                    method: 'DELETE',
                    url: `${API_GATEWAY_URL}/${id}`,
                    headers: { 'x-api-key': API_KEY },
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            resolve();
                        } else {
                            reject(res);
                        }
                    },
                    onerror: (err) => {
                        console.error('AWS Backend Error (DELETE):', err);
                        alert('Error: Could not delete link from the backend. Check console for details.');
                        reject(err);
                    }
                });
            } else {
                let links = await GM_getValue(STORAGE_KEY, []);
                links = links.filter(link => link.id !== id);
                await GM_setValue(STORAGE_KEY, links);
                resolve();
            }
        }),

        /**
         * Deletes all saved estimates.
         * @returns {Promise<void>}
         */
        clearAllLinks: () => new Promise((resolve, reject) => {
            if (useAWSBackend) {
                GM_xmlhttpRequest({
                    method: 'DELETE',
                    url: API_GATEWAY_URL,
                    headers: { 'x-api-key': API_KEY },
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            resolve();
                        } else {
                            reject(res);
                        }
                    },
                    onerror: (err) => {
                        console.error('AWS Backend Error (Clear All):', err);
                        alert('Error: Could not clear all links from the backend. Check console for details.');
                        reject(err);
                    }
                });
            } else {
                GM_setValue(STORAGE_KEY, []);
                resolve();
            }
        })
    };


    // =========================================================================
    // UI COMPONENTS & LOGIC
    // =========================================================================

    /**
     * Shows a large, temporary notification in the center of the screen.
     * @param {string} message - The message to display.
     */
    function showPopupNotification(message) {
        const popup = document.createElement('div');
        popup.className = 'cls2-popup-notification';
        popup.textContent = message;
        document.body.appendChild(popup);
        setTimeout(() => popup.classList.add('show'), 10); // Fade in
        setTimeout(() => {
            popup.classList.remove('show'); // Fade out
            popup.addEventListener('transitionend', () => popup.remove());
        }, 2500);
    }

    /**
     * Creates and injects the main UI elements into the page.
     */
    function initializeUI() {
        // Floating Action Button
        const fab = document.createElement('button');
        fab.className = 'cls2-fab';
        fab.innerHTML = '📑';
        fab.title = 'View Saved Estimates';
        document.body.appendChild(fab);

        // Modal Overlay and Content
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'cls2-modal-overlay';
        modalOverlay.innerHTML = `
            <div class="cls2-modal-content">
                <div class="cls2-modal-header">
                    <h2>Saved AWS Estimates</h2>
                    <button class="cls2-modal-close" title="Close">&times;</button>
                </div>
                <div class="cls2-modal-body">
                    <table class="cls2-links-table">
                        <thead><tr><th>Timestamp</th><th>Name</th><th>URL</th><th>Action</th></tr></thead>
                        <tbody></tbody>
                    </table>
                    <p class="cls2-no-links-msg" style="display:none; text-align:center; margin-top: 20px;">No saved estimates yet.</p>
                </div>
                <div class="cls2-modal-footer">
                    <span class="cls2-backend-status">Mode: ${useAWSBackend ? 'AWS Backend (Secure)' : 'Local Storage'}</span>
                    <div>
                        <button class="cls2-footer-btn cls2-download-all" title="Download all data as a CSV file">Download CSV</button>
                        <button class="cls2-footer-btn cls2-clear-all" title="Delete all saved links">Clear All</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        // Add event listeners
        fab.addEventListener('click', showModal);
        modalOverlay.querySelector('.cls2-modal-close').addEventListener('click', hideModal);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) hideModal();
        });
        modalOverlay.querySelector('.cls2-download-all').addEventListener('click', handleDownloadCsv);
        modalOverlay.querySelector('.cls2-clear-all').addEventListener('click', handleClearAll);

        // Add delegated event listener for delete buttons
        modalOverlay.querySelector('.cls2-links-table tbody').addEventListener('click', async (e) => {
            if (e.target.classList.contains('cls2-link-item-delete')) {
                const idToDelete = e.target.dataset.id;
                await dataHandler.deleteLink(idToDelete);
                renderLinksTable(); // Refresh the table
            }
        });
    }

    /**
     * Renders the saved links into the modal's table.
     */
    async function renderLinksTable() {
        const modal = document.querySelector('.cls2-modal-overlay');
        const tableBody = modal.querySelector('.cls2-links-table tbody');
        const noLinksMsg = modal.querySelector('.cls2-no-links-msg');
        const footerButtons = modal.querySelectorAll('.cls2-footer-btn');

        try {
            const links = await dataHandler.getLinks();
            tableBody.innerHTML = '';
            const hasLinks = links.length > 0;

            noLinksMsg.style.display = hasLinks ? 'none' : 'block';
            footerButtons.forEach(btn => btn.style.display = hasLinks ? 'inline-block' : 'none');

            if (hasLinks) {
                // Sort by timestamp descending
                links.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                links.forEach(linkObj => {
                    const row = tableBody.insertRow();
                    row.innerHTML = `
                        <td>${new Date(linkObj.timestamp).toLocaleString()}</td>
                        <td>${linkObj.name}</td>
                        <td><a href="${linkObj.url}" target="_blank" rel="noopener noreferrer">Open Link</a></td>
                        <td><button class="cls2-link-item-delete" data-id="${linkObj.id}">Delete</button></td>
                    `;
                });
            }
        } catch (error) {
            console.error("Failed to load estimates:", error);
            let errorMsg = "Failed to load estimates. Is the API Key correct?";
            if (error.status === 403) {
                errorMsg = "Access Denied (403). Please check your API Key."
            } else if (error.status === 429) {
                errorMsg = "Too many requests (429). Please wait and try again."
            }
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:red;">${errorMsg}</td></tr>`;
        }
    }

    function showModal() {
        renderLinksTable();
        document.querySelector('.cls2-modal-overlay').classList.add('visible');
    }

    function hideModal() {
        document.querySelector('.cls2-modal-overlay').classList.remove('visible');
    }

    async function handleClearAll() {
        if (confirm('Are you sure you want to delete all saved estimates?')) {
            await dataHandler.clearAllLinks();
            renderLinksTable();
        }
    }

    async function handleDownloadCsv() {
        const links = await dataHandler.getLinks();
        if (links.length === 0) {
            alert('No estimates to download.');
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Timestamp,Name,URL\n";

        links.forEach(link => {
            const name = `"${link.name.replace(/"/g, '""')}"`; // Escape double quotes
            const timestamp = `"${new Date(link.timestamp).toLocaleString()}"`;
            csvContent += `${timestamp},${name},${link.url}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const linkElement = document.createElement("a");
        linkElement.setAttribute("href", encodedUri);
        linkElement.setAttribute("download", "aws_estimates.csv");
        document.body.appendChild(linkElement);
        linkElement.click();
        document.body.removeChild(linkElement);
    }


    // =========================================================================
    // AWS PAGE INTERACTION (via MutationObserver)
    // =========================================================================

    /**
     * Handles the click event on the AWS "Copy public link" button.
     * @param {Event} e - The click event.
     */
    async function handleCopyButtonClick(e) {
        const wrapper = e.target.closest('.save-share-clipboard-wrapper');
        const input = wrapper?.querySelector('input[type="text"][readonly]');
        if (!input || !input.value) return;

        const url = input.value;
        const links = await dataHandler.getLinks();

        // Prevent saving duplicates
        if (links.some(link => link.url === url)) {
            showPopupNotification('ℹ️ Link Already Saved');
            return;
        }

        const nameElement = document.querySelector('h1[class*="awsui_h1-variant"]');
        const name = nameElement ? nameElement.textContent.trim() : "Untitled Estimate";
        const timestamp = new Date().toISOString();

        const newLink = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique ID for local and backend use
            name: name,
            url: url,
            timestamp: timestamp
        };

        try {
            await dataHandler.saveLink(newLink);
            showPopupNotification('✅ Estimate Saved!');
        } catch (error) {
            showPopupNotification('❌ Save Failed!');
        }
    }

    /**
     * Attaches a click listener to the copy button if it doesn't already have one.
     * @param {Node} targetNode - The DOM node to search within.
     */
    function attachListenerToCopyButton(targetNode) {
        // Use a more specific selector for the copy button inside the "Save and Share" modal
        const copyButton = targetNode.querySelector('.save-share-clipboard-wrapper .clipboard-button');
        if (copyButton && !copyButton.dataset.cls2ListenerAttached) {
            copyButton.addEventListener('click', handleCopyButtonClick);
            copyButton.dataset.cls2ListenerAttached = 'true';
        }
    }

    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // It's an element node
                        // Check if the node itself is the button, or contains it
                        attachListenerToCopyButton(node);
                    }
                });
            }
        }
    });

    // =========================================================================
    // SCRIPT INITIALIZATION
    // =========================================================================
    initializeUI();
    observer.observe(document.body, { childList: true, subtree: true });

})();
