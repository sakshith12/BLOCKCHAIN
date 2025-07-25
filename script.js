import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

console.log("script.js loaded!"); // Debugging line to confirm file loads

// --- Supabase Configuration (REPLACE WITH YOURS) ---
const SUPABASE_URL = '<your_supabase_url>'; // e.g., 'https://abcde12345.supabase.co'
const SUPABASE_ANON_KEY = '<your_supabase_anon_key>'; // e.g., 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Global Variables ---
let web3; // Web3.js instance
let connectedAccount = null; // Connected MetaMask account address
let isAuthReady = false; // Flag to indicate if MetaMask is connected

// --- DOM Elements ---
const connectMetaMaskButton = document.getElementById('connectMetaMaskButton');
const metaMaskStatus = document.getElementById('metaMaskStatus');
const metaMaskSpinner = document.getElementById('metaMaskSpinner');
const connectedAccountDisplay = document.getElementById('connectedAccountDisplay');
const accountAddressSpan = document.getElementById('accountAddress');

const navButtons = document.querySelectorAll('.nav-button');
const paneContents = document.querySelectorAll('.pane-content');
const connectWalletPane = document.getElementById('connect-wallet-pane');

const uploadFile = document.getElementById('uploadFile');
const uploadButton = document.getElementById('uploadButton');
const uploadStatus = document.getElementById('uploadStatus');
const fileHashDisplay = document.getElementById('fileHashDisplay');
const currentFileHashElem = document.getElementById('currentFileHash');
const uploadSpinner = document.getElementById('uploadSpinner');

const ledgerDisplay = document.getElementById('ledgerDisplay');
const noEntriesMessage = document.getElementById('noEntriesMessage');

const verifyFile = document.getElementById('verifyFile');
const verifyButton = document.getElementById('verifyButton');
const verifyStatus = document.getElementById('verifyStatus');
const verifySpinner = document.getElementById('verifySpinner');

// --- Utility Functions ---
function setStatus(element, message, type) {
    element.textContent = message;
    element.className = `status-message ${type}`;
    element.classList.remove('hidden');
}

function clearStatus(element) {
    element.classList.add('hidden');
    element.textContent = '';
}

function showSpinner(spinnerElement, buttonElement) {
    spinnerElement.classList.remove('hidden');
    buttonElement.disabled = true;
}

function hideSpinner(spinnerElement, buttonElement) {
    spinnerElement.classList.add('hidden');
    buttonElement.disabled = false;
}

// --- Pane Switching Logic ---
function showPane(paneId) {
    paneContents.forEach(pane => {
        pane.classList.add('hidden');
    });
    document.getElementById(paneId).classList.remove('hidden');

    navButtons.forEach(button => {
        button.classList.remove('bg-indigo-700', 'text-white');
        button.classList.add('text-indigo-200', 'hover:bg-indigo-600');
    });
    const activeButton = document.querySelector(`button[data-pane="${paneId}"]`);
    if (activeButton) {
        activeButton.classList.add('bg-indigo-700', 'text-white');
        activeButton.classList.remove('text-indigo-200', 'hover:bg-indigo-600');
    }
}

navButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetPane = button.dataset.pane;

        // Panes requiring MetaMask
        if (targetPane === 'upload-pane' || targetPane === 'audit-pane') {
            if (!isAuthReady) {
                setStatus(metaMaskStatus, "Please connect your MetaMask wallet to access this feature.", 'status-info');
                showPane('connect-wallet-pane');
                return;
            }
        }
        // For 'verify-pane' and 'tamper-demo-pane', no MetaMask check is needed here
        showPane(targetPane);
        // If switching to audit pane, ensure ledger is fetched
        if (targetPane === 'audit-pane') {
            fetchAndRenderLedger();
        }
    });
});

// --- MetaMask Connection ---
connectMetaMaskButton.addEventListener('click', async () => {
    showSpinner(metaMaskSpinner, connectMetaMaskButton);
    clearStatus(metaMaskStatus);

    console.log("Connect MetaMask button clicked."); // Debugging
    console.log("window.ethereum:", window.ethereum); // Debugging: Check if MetaMask provider is available
    console.log("window.Web3:", window.Web3); // Debugging: Check if Web3 library is globally available

    if (window.ethereum) {
        try {
            // Request account access
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            // Explicitly use window.Web3 to ensure it's accessed from global scope
            if (typeof window.Web3 !== 'undefined') {
                web3 = new window.Web3(window.ethereum);
            } else {
                console.error("Web3 library not found on window object.");
                setStatus(metaMaskStatus, "Web3 library not loaded correctly. Please check console.", 'status-error');
                hideSpinner(metaMaskSpinner, connectMetaMaskButton);
                return;
            }

            connectedAccount = accounts[0];
            accountAddressSpan.textContent = connectedAccount;
            connectedAccountDisplay.classList.remove('hidden');
            isAuthReady = true;
            setStatus(metaMaskStatus, `Connected: ${connectedAccount.substring(0, 6)}...${connectedAccount.slice(-4)}`, 'status-success');
            console.log("MetaMask connected. Account:", connectedAccount);

            // Listen for account changes
            window.ethereum.on('accountsChanged', (newAccounts) => {
                if (newAccounts.length > 0) {
                    connectedAccount = newAccounts[0];
                    accountAddressSpan.textContent = connectedAccount;
                    setStatus(metaMaskStatus, `Account changed to: ${connectedAccount.substring(0, 6)}...${connectedAccount.slice(-4)}`, 'status-info');
                    console.log("MetaMask account changed:", connectedAccount);
                    fetchAndRenderLedger();
                } else {
                    connectedAccount = null;
                    isAuthReady = false;
                    setStatus(metaMaskStatus, "MetaMask disconnected. Please connect again.", 'status-error');
                    connectedAccountDisplay.classList.add('hidden');
                    console.log("MetaMask disconnected.");
                    showPane('connect-wallet-pane');
                }
            });

            // Listen for chain changes (network changes)
            window.ethereum.on('chainChanged', (chainId) => {
                console.log("Network changed to:", chainId);
                setStatus(metaMaskStatus, `Network changed. Please ensure you are on the correct network.`, 'status-info');
            });

            showPane('upload-pane');
            fetchAndRenderLedger();
        } catch (error) {
            console.error("MetaMask connection failed:", error);
            setStatus(metaMaskStatus, `MetaMask connection failed: ${error.message}`, 'status-error');
            isAuthReady = false;
        }
    } else {
        setStatus(metaMaskStatus, "MetaMask is not installed. Please install it to use this application.", 'status-error');
        isAuthReady = false;
    }
    hideSpinner(metaMaskSpinner, connectMetaMaskButton);
});

// --- Hashing Function ---
async function sha256(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hexHash;
}

// --- Utility to calculate content hash for chaining ---
async function calculateBlockContentHash(blockData) {
    const timestampForHash = blockData.timestamp instanceof Date
        ? blockData.timestamp.toISOString()
        : blockData.timestamp;

    const dataToHash = {
        fileHash: blockData.file_hash,
        fileName: blockData.file_name,
        timestamp: timestampForHash,
        blockNumber: blockData.block_number
    };
    const jsonString = JSON.stringify(dataToHash);
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- File Upload Logic ---
uploadButton.addEventListener('click', async () => {
    if (!isAuthReady || !connectedAccount) {
        setStatus(uploadStatus, "Please connect your MetaMask wallet to upload files.", 'status-error');
        showPane('connect-wallet-pane');
        return;
    }
    const file = uploadFile.files[0];
    if (!file) {
        setStatus(uploadStatus, "Please select a file to upload.", 'status-error');
        return;
    }

    showSpinner(uploadSpinner, uploadButton);
    clearStatus(uploadStatus);
    fileHashDisplay.classList.add('hidden');

    try {
        setStatus(uploadStatus, "Calculating file hash...", 'status-info');
        const fileHash = await sha256(file);
        currentFileHashElem.textContent = fileHash;
        fileHashDisplay.classList.remove('hidden');

        setStatus(uploadStatus, "Fetching last block from Supabase...", 'status-info');
        const { data: lastBlocks, error: lastBlockError } = await supabase
            .from('blockchain_ledger')
            .select('*')
            .order('block_number', { ascending: false })
            .limit(1);

        if (lastBlockError) throw lastBlockError;

        let lastBlock = null;
        let previousBlockContentHash = "0";
        let nextBlockNumber = 1;

        if (lastBlocks && lastBlocks.length > 0) {
            lastBlock = lastBlocks[0];
            previousBlockContentHash = await calculateBlockContentHash(lastBlock);
            nextBlockNumber = lastBlock.block_number + 1;
        }

        setStatus(uploadStatus, "Adding block to ledger via Supabase...", 'status-info');
        const newBlock = {
            file_hash: fileHash,
            file_name: file.name,
            previous_block_content_hash: previousBlockContentHash,
            block_number: nextBlockNumber,
            user_id: connectedAccount
        };

        const { error: insertError } = await supabase
            .from('blockchain_ledger')
            .insert([newBlock]);

        if (insertError) throw insertError;

        setStatus(uploadStatus, `File "${file.name}" uploaded and logged successfully! Block #${nextBlockNumber}`, 'status-success');
        uploadFile.value = '';
        fetchAndRenderLedger();
    } catch (error) {
        console.error("Error during file upload:", error);
        setStatus(uploadStatus, `Error uploading file: ${error.message}`, 'status-error');
    } finally {
        hideSpinner(uploadSpinner, uploadButton);
    }
});

// --- Ledger Display Logic (Real-time updates & Initial Fetch) ---
async function fetchAndRenderLedger() {
    const { data: blocks, error } = await supabase
        .from('blockchain_ledger')
        .select('*')
        .order('block_number', { ascending: true });

    if (error) {
        console.error("Error fetching ledger:", error);
        ledgerDisplay.innerHTML = `<p class="text-red-600 text-center">Error loading ledger: ${error.message}</p>`;
        noEntriesMessage.classList.add('hidden');
        return;
    }

    ledgerDisplay.innerHTML = '';
    if (blocks.length === 0) {
        noEntriesMessage.classList.remove('hidden');
        return;
    } else {
        noEntriesMessage.classList.add('hidden');
    }

    let isChainValid = true;
    let previousBlockData = null;

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        const timestampStr = new Date(block.timestamp).toLocaleString();

        let blockValidityClass = 'text-gray-800';
        let chainIntegrityMessage = '';

        if (i > 0 && previousBlockData) {
            const expectedPreviousHash = await calculateBlockContentHash(previousBlockData);
            if (block.previous_block_content_hash !== expectedPreviousHash) {
                isChainValid = false;
                blockValidityClass = 'bg-red-100 text-red-800';
                chainIntegrityMessage = '<p class="text-red-600 text-xs mt-1">🚨 Chain integrity compromised from this block!</p>';
            }
        }

        const entryDiv = document.createElement('div');
        entryDiv.className = `ledger-entry p-4 rounded-lg shadow-sm mb-4 ${blockValidityClass}`;
        entryDiv.innerHTML = `
            <p class="font-bold text-lg">Block #${block.block_number}</p>
            <p class="text-sm text-gray-600"><strong>File Name:</strong> ${block.file_name}</p>
            <p class="text-sm text-gray-600 break-words"><strong>File Hash:</strong> <span class="font-mono text-xs">${block.file_hash}</span></p>
            <p class="text-sm text-gray-600 break-words"><strong>Prev. Block Hash:</strong> <span class="font-mono text-xs">${block.previous_block_content_hash}</span></p>
            <p class="text-sm text-gray-600"><strong>Timestamp:</strong> ${timestampStr}</p>
            <p class="text-sm text-gray-600"><strong>Logged by User:</strong> ${block.user_id ? block.user_id.substring(0, 8) + '...' : 'N/A (MetaMask not connected)'}</p>
            ${chainIntegrityMessage}
        `;
        ledgerDisplay.appendChild(entryDiv);

        previousBlockData = block;
    }

    if (!isChainValid) {
        setStatus(verifyStatus, "Warning: The blockchain ledger's integrity is compromised! Some blocks might have been tampered with.", 'status-error');
    } else {
        if (verifyStatus.classList.contains('status-error') && verifyStatus.textContent.includes('Blockchain integrity compromised')) {
            clearStatus(verifyStatus);
        }
    }
}

// Setup Supabase real-time listener
function setupSupabaseRealtime() {
    supabase
        .channel('public:blockchain_ledger')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'blockchain_ledger' }, payload => {
            console.log('Change received!', payload);
            fetchAndRenderLedger();
        })
        .subscribe();
}

// --- File Verification Logic ---
verifyButton.addEventListener('click', async () => {
    const file = verifyFile.files[0];
    if (!file) {
        setStatus(verifyStatus, "Please select a file to verify.", 'status-error');
        return;
    }

    showSpinner(verifySpinner, verifyButton);
    clearStatus(verifyStatus);

    try {
        setStatus(verifyStatus, "Calculating file hash for verification...", 'status-info');
        const verificationFileHash = await sha256(file);

        setStatus(verifyStatus, "Retrieving ledger for verification...", 'status-info');
        const { data: blocks, error } = await supabase
            .from('blockchain_ledger')
            .select('*')
            .order('block_number', { ascending: true });

        if (error) throw error;

        if (blocks.length === 0) {
            setStatus(verifyStatus, "Ledger is empty. No files to verify against.", 'status-error');
            return;
        }

        let foundMatch = false;
        let isChainIntact = true;
        let previousBlockData = null;

        for (const block of blocks) {
            if (previousBlockData) {
                const expectedPreviousHash = await calculateBlockContentHash(previousBlockData);
                if (block.previous_block_content_hash !== expectedPreviousHash) {
                    isChainIntact = false;
                    setStatus(verifyStatus, `Verification failed: Blockchain integrity compromised at Block #${block.block_number}.`, 'status-error');
                    break;
                }
            }

            if (block.file_hash === verificationFileHash && block.file_name === file.name) {
                foundMatch = true;
                setStatus(verifyStatus, `File "${file.name}" verified successfully! Match found in Block #${block.block_number}. Ledger is intact.`, 'status-success');
                break;
            }
            previousBlockData = block;
        }

        if (isChainIntact && !foundMatch) {
            setStatus(verifyStatus, `Verification failed: No matching entry found for "${file.name}" in the ledger with the calculated hash.`, 'status-error');
        } else if (!isChainIntact) {
            // Status already set by the chain integrity check
        }

    } catch (error) {
        console.error("Error during file verification:", error);
        setStatus(verifyStatus, `Error verifying file: ${error.message}`, 'status-error');
    } finally {
        hideSpinner(verifySpinner, verifyButton);
    }
});

// --- Initial Setup ---
window.onload = () => {
    console.log("Window loaded. Initializing..."); // Debugging
    showPane('connect-wallet-pane');
    setupSupabaseRealtime();
    fetchAndRenderLedger();
};
