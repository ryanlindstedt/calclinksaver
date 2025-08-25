// ==UserScript==
// @name         CalcLinkSaver
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Save, manage, and download AWS Calculator estimates with an optional AWS backend or local storage fallback.
// @author       Gemini
// @match        https://calculator.aws/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      amazonaws.com
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // SCRIPT CONFIGURATION
    // =========================================================================
    const API_GATEWAY_URL = ''; // e.g., 'https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/estimates'
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
    /* --- General Font Style --- */
    .cls2-modal-content, .cls2-fab, .cls2-footer-btn {
        font-family: "Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif;
    }

    /* --- Pop-up Notification --- */
    .cls2-popup-notification {
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(35, 47, 62, 0.95); color: #ffffff;
        padding: 40px 60px; border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        z-index: 100001; font-size: 28px; font-weight: bold;
        opacity: 0; transition: opacity 0.4s ease, transform 0.4s ease;
        transform: translate(-50%, -60%);
        font-family: "Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif;
    }
    .cls2-popup-notification.show { opacity: 1; transform: translate(-50%, -50%); }

    /* --- Main Button --- */
    .cls2-fab {
        position: fixed; bottom: 5px; right: 95px;
        width: auto; height: 30px;
        background-color: #ff9900; color: #000000;
        padding: 8px 15px;
        border: none; box-shadow: 0 4px 10px rgba(0,0,0,0.25);
        font-size: 14px; font-weight: bold;
        display: flex; align-items: center;
        justify-content: center; cursor: pointer; z-index: 99998;
        transition: background-color 0.2s ease;
    }
    .cls2-fab:hover {
        background-color: #fa6f00;
    }

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
    .cls2-links-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .cls2-links-table th, .cls2-links-table td {
        padding: 8px 12px;
        text-align: left; border-bottom: 1px solid #e0e0e0;
        word-wrap: break-word;
    }
    .cls2-links-table th { font-weight: bold; background-color: #fafafa; }
    .cls2-links-table .cls2-col-timestamp { width: 190px; }
    .cls2-links-table .cls2-col-actions { width: 120px; }


    /* --- Action Icons in Table --- */
    .cls2-actions {
        display: flex; align-items: center; gap: 15px;
        justify-content: flex-end; /* ALIGNS icons to the right */
    }
    .cls2-action-btn {
        background: none; border: none; cursor: pointer;
        padding: 0; font-size: 18px; line-height: 1;
        color: #545b64; text-decoration: none;
        transition: transform 0.2s ease;
    }
    .cls2-action-btn:hover { transform: scale(1.2); }
    .cls2-action-btn.delete-icon { color: #d13212; }

    /* --- Modal Footer --- */
    .cls2-modal-footer {
        margin-top: 20px; padding-top: 16px; border-top: 1px solid #e0e0e0;
        display: flex; justify-content: space-between; align-items: center; gap: 10px;
    }
    .cls2-backend-status {
        flex-grow: 1;
        text-align: center;
        font-size: 12px; color: #545b64;
    }
    .cls2-footer-btn {
        border: none; border-radius: 4px; padding: 8px 16px;
        cursor: pointer; font-weight: bold;
        transition: background-color 0.2s ease;
    }
    .cls2-download-all { background: #ff9900; color: #000000; }
    .cls2-download-all:hover { background: #fa6f00; }
    .cls2-delete-all { background: #d13212; color: white; }
    `);


    // =========================================================================
    // DATA HANDLING LOGIC (Omitted for brevity, it is unchanged)
    // =========================================================================
    const dataHandler = {
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
    function showPopupNotification(message) {
        const popup = document.createElement('div');
        popup.className = 'cls2-popup-notification';
        popup.textContent = message;
        document.body.appendChild(popup);
        setTimeout(() => popup.classList.add('show'), 10);
        setTimeout(() => {
            popup.classList.remove('show');
            popup.addEventListener('transitionend', () => popup.remove());
        }, 2500);
    }

    function initializeUI() {
        const fab = document.createElement('button');
        fab.className = 'cls2-fab';
        fab.textContent = 'CalcLinkSaver';
        fab.title = 'View Saved Estimates';
        document.body.appendChild(fab);

        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'cls2-modal-overlay';
        modalOverlay.innerHTML = `
        <div class="cls2-modal-content">
        <div class="cls2-modal-header">
        <h2>CalcLinkSaver</h2>
        <button class="cls2-modal-close" title="Close">&times;</button>
        </div>
        <div class="cls2-modal-body">
        <table class="cls2-links-table">
        <thead>
        <tr>
        <th>Name</th>
        <th class="cls2-col-timestamp">Timestamp</th>
        <th class="cls2-col-actions">Action</th>
        </tr>
        </thead>
        <tbody></tbody>
        </table>
        <p class="cls2-no-links-msg" style="display:none; text-align:center; margin-top: 20px;">No saved estimates yet.</p>
        </div>
        <div class="cls2-modal-footer">
        <button class="cls2-footer-btn cls2-delete-all" title="Delete all saved links">Delete All</button>
        <span class="cls2-backend-status">Mode: ${useAWSBackend ? 'AWS Backend (Secure)' : 'Local Storage'}</span>
        <button class="cls2-footer-btn cls2-download-all" title="Download all data as a CSV file">Download CSV</button>
        </div>
        </div>
        `;
        document.body.appendChild(modalOverlay);

        fab.addEventListener('click', showModal);
        modalOverlay.querySelector('.cls2-modal-close').addEventListener('click', hideModal);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) hideModal();
        });
            modalOverlay.querySelector('.cls2-download-all').addEventListener('click', handleDownloadCsv);
            modalOverlay.querySelector('.cls2-delete-all').addEventListener('click', handleDeleteAll);

            modalOverlay.querySelector('.cls2-links-table tbody').addEventListener('click', async (e) => {
                const actionBtn = e.target.closest('.cls2-action-btn');
                if (!actionBtn) return;

                const action = actionBtn.dataset.action;

                if (action === 'delete') {
                    if (confirm('Are you sure you want to delete this estimate?')) {
                        const idToDelete = actionBtn.dataset.id;
                        await dataHandler.deleteLink(idToDelete);
                        renderLinksTable();
                    }
                } else if (action === 'copy') {
                    const urlToCopy = actionBtn.dataset.url;
                    navigator.clipboard.writeText(urlToCopy).then(() => {
                        showPopupNotification('✅ URL Copied!');
                    }, (err) => {
                        showPopupNotification('❌ Copy Failed');
                        console.error('Failed to copy URL: ', err);
                    });
                }
            });
    }

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
                links.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                links.forEach(linkObj => {
                    const row = tableBody.insertRow();
                    row.innerHTML = `
                    <td>${linkObj.name}</td>
                    <td class="cls2-col-timestamp">${new Date(linkObj.timestamp).toLocaleString()}</td>
                    <td class="cls2-col-actions">
                    <div class="cls2-actions">
                    <button class="cls2-action-btn" data-action="copy" data-url="${linkObj.url}" title="Copy URL">📋</button>
                    <a href="${linkObj.url}" target="_blank" rel="noopener noreferrer" class="cls2-action-btn" title="Open Link">↗️</a>
                    <button class="cls2-action-btn delete-icon" data-action="delete" data-id="${linkObj.id}" title="Delete Estimate">❌</button>
                    </div>
                    </td>
                    `;
                });
            }
        } catch (error) {
            console.error("Failed to load estimates:", error);
            tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:red;">Failed to load estimates. Check API Key and @connect directive.</td></tr>`;
        }
    }

    function showModal() {
        renderLinksTable();
        document.querySelector('.cls2-modal-overlay').classList.add('visible');
    }

    function hideModal() {
        document.querySelector('.cls2-modal-overlay').classList.remove('visible');
    }

    async function handleDeleteAll() {
        if (confirm('Are you sure you want to delete ALL saved estimates? This cannot be undone.')) {
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

        let csvContent = "Name,Timestamp,URL\n";
        links.forEach(link => {
            const name = `"${link.name.replace(/"/g, '""')}"`;
            const timestamp = `"${new Date(link.timestamp).toLocaleString()}"`;
            const url = link.url;
            csvContent += `${name},${timestamp},${url}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const linkElement = document.createElement("a");
        const url = URL.createObjectURL(blob);
        linkElement.setAttribute("href", url);
        linkElement.setAttribute("download", "aws_estimates.csv");
        linkElement.style.visibility = 'hidden';
        document.body.appendChild(linkEement);
        linkElement.click();
        document.body.removeChild(linkElement);
        URL.revokeObjectURL(url);
    }


    // =========================================================================
    // AWS PAGE INTERACTION (Omitted for brevity, it is unchanged)
    // =========================================================================
    async function handleCopyButtonClick(e) {
        const wrapper = e.target.closest('.save-share-clipboard-wrapper');
        const input = wrapper?.querySelector('input[type="text"][readonly]');
        if (!input || !input.value) return;

        const url = input.value;
        const links = await dataHandler.getLinks();

        if (links.some(link => link.url === url)) {
            showPopupNotification('ℹ️ Link Already Saved');
            return;
        }

        const nameElement = document.querySelector('h1[class*="awsui_h1-variant"]');
        const name = nameElement ? nameElement.textContent.trim() : "Untitled Estimate";
        const timestamp = new Date().toISOString();

        const newLink = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

    function attachListenerToCopyButton(targetNode) {
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
                    if (node.nodeType === 1) {
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
