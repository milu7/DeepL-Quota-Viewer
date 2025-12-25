// Global configuration
const STORAGE_KEY = 'deepl_app_config_v2'; // Bump version for new structure
const HISTORY_KEY = 'deepl_query_history';
const SALT_PREFIX = 'deepl_salt_';
let csrfToken = '';
let isCooldown = false; // Moved to top
let cooldownTimer = null;
let editModal; // Declared here, initialized later
let deleteModal; // Declared here, initialized later
let currentDeleteId = null;

// State Management
let appState = {
    keys: [] // Array of { id, apiKey, email, password, usage: { count, limit } }
};

// 0. Initialize (Get CSRF Token)
async function initApp() {
    // Initialize Modal after DOM is ready
    editModal = new bootstrap.Modal(document.getElementById('editModal'));
    deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));

    try {
        const response = await fetch('api.php?action=init');
        const data = await response.json();
        if (data.token) {
            csrfToken = data.token;
            console.log("Secure session initialized");
        } else {
            console.error("Failed to initialize session");
        }
    } catch (e) {
        console.error("Initialization error:", e);
    }

    // Auto-load checks
    await loadConfig(true); // Auto load without toast
    renderKeyList();
    renderHistory();
}

// 1. Browser Fingerprint Generation
async function getBrowserFingerprint() {
    const components = [
        navigator.userAgent,
        navigator.language,
        screen.colorDepth,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 'unknown'
    ];
    const rawString = components.join('||');
    // Use SHA256 from CryptoJS
    return CryptoJS.SHA256(rawString).toString();
}

// 2. Encryption / Decryption Helpers
async function encryptData(data) {
    const fingerprint = await getBrowserFingerprint();
    try {
        const jsonStr = JSON.stringify(data);
        return CryptoJS.AES.encrypt(jsonStr, fingerprint).toString();
    } catch (e) {
        console.error("Encryption failed", e);
        return null;
    }
}

async function decryptData(encryptedStr) {
    const fingerprint = await getBrowserFingerprint();
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedStr, fingerprint);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
        return JSON.parse(decryptedStr);
    } catch (e) {
        console.error("Decryption failed - Fingerprint mismatch or corrupted data", e);
        return null;
    }
}

// 3. UI Helpers
function showToast(message, type = 'success') {
    const toastEl = document.getElementById('liveToast');
    const toastBody = document.getElementById('toastMessage');
    
    toastEl.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : 'primary'} border-0`;
    toastBody.textContent = message;
    
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

function toggleVisibility(id) {
    const input = document.getElementById(id);
    input.type = input.type === "password" ? "text" : "password";
}

// 4. Parser Logic
function parseAndImport() {
    const rawText = document.getElementById('rawInput').value;
    if (!rawText.trim()) {
        showToast('请输入要解析的文本', 'error');
        return;
    }

    // New parsing logic for multiple blocks
    // Strategy: Split by "密钥" or just scan globally
    // We'll use a loop with regex execution to find blocks
    
    // Pattern to identify the start of a block or a key line
    // We assume a block might look like:
    // 密钥: k1 ... 账户: a1 ...
    // or just mixed.
    
    // Simpler approach: Extract all Keys, Accounts, Passwords into lists, then zip them? 
    // No, that risks misalignment. 
    
    // Better: Split text into chunks based on "密钥" keyword, since Key is mandatory.
    
    // 1. Normalize separators
    let text = rawText.replace(/[:：]/g, ':');
    
    // 2. Find all keys first, then look for context around them?
    // Let's try to parse block by block. 
    // We assume the text is roughly sequential: Key -> Account -> Password (or mixed order nearby)
    
    const keyPattern = /(?:密钥|Key|API\s*Key):\s*([a-zA-Z0-9\-:]{30,})/gi;
    const accountPattern = /(?:账户|Account|Email):\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
    const pwdPattern = /(?:密码|Password):\s*(.+)/i;

    let matches;
    let newKeysCount = 0;
    
    // We will scan the text. For each "Key" match, we look ahead until the next "Key" match 
    // to find Account and Password belonging to this key.
    
    // Get all start indices of keys
    const keyIndices = [];
    while ((matches = keyPattern.exec(text)) !== null) {
        keyIndices.push({
            start: matches.index,
            key: matches[1].trim()
        });
    }

    if (keyIndices.length === 0) {
        showToast('未找到有效的 API 密钥格式', 'error');
        return;
    }

    for (let i = 0; i < keyIndices.length; i++) {
        const current = keyIndices[i];
        const next = keyIndices[i + 1];
        
        // Define the text chunk for this key
        const end = next ? next.start : text.length;
        const chunk = text.substring(current.start, end);
        
        // Check validity
        const isValidFormat = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(:fx)?$/i.test(current.key);
        if (!isValidFormat && current.key.length <= 30) {
            console.warn("Skipping invalid key:", current.key);
            continue;
        }

        // Search for account/pass in this chunk
        const accMatch = chunk.match(accountPattern);
        const pwdMatch = chunk.match(pwdPattern);

        const newEntry = {
            id: Date.now() + Math.random().toString(16).slice(2),
            apiKey: current.key,
            email: accMatch ? accMatch[1].trim() : '',
            password: pwdMatch ? pwdMatch[1].trim() : '',
            usage: null // Not queried yet
        };

        // Check for duplicates
        const exists = appState.keys.some(k => k.apiKey === newEntry.apiKey);
        if (!exists) {
            appState.keys.push(newEntry);
            newKeysCount++;
        }
    }

    if (newKeysCount > 0) {
        showToast(`成功导入 ${newKeysCount} 个新密钥`);
        document.getElementById('rawInput').value = '';
        renderKeyList();
        saveConfig(); // Auto save
    } else {
        showToast('未导入任何新密钥 (可能是重复或格式错误)', 'warning');
    }
}

// 4.1 Export Logic
function exportKeys() {
    if (appState.keys.length === 0) {
        showToast('没有可导出的密钥', 'warning');
        return;
    }

    let content = "";
    appState.keys.forEach(k => {
        content += `密钥: ${k.apiKey}\n`;
        if (k.email) content += `账户: ${k.email}\n`;
        if (k.password) content += `密码: ${k.password}\n`;
        content += "\n";
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepl_keys_export_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('导出成功');
}

// 4.2 Edit Logic
let currentEditId = null;
// editModal initialized in initApp

function editOne(id) {
    const k = appState.keys.find(k => k.id === id);
    if (!k) return;

    currentEditId = id;
    document.getElementById('editId').value = id;
    document.getElementById('editEmail').value = k.email || '';
    document.getElementById('editKey').value = k.apiKey || '';
    document.getElementById('editPassword').value = k.password || '';

    editModal.show();
}

function saveEdit() {
    if (!currentEditId) return;

    const newEmail = document.getElementById('editEmail').value.trim();
    const newKey = document.getElementById('editKey').value.trim();
    const newPass = document.getElementById('editPassword').value.trim();

    if (!newKey) {
        alert('API 密钥不能为空');
        return;
    }

    const index = appState.keys.findIndex(k => k.id === currentEditId);
    if (index !== -1) {
        appState.keys[index].email = newEmail;
        appState.keys[index].apiKey = newKey;
        appState.keys[index].password = newPass;
        // Reset usage if key changed? Maybe safer to keep it or reset if user wants.
        // Usually if key changes, usage is invalid.
        // We'll reset usage just in case key string changed.
        appState.keys[index].usage = null; 
        appState.keys[index].error = null;

        renderKeyList();
        saveConfig();
        editModal.hide();
        showToast('修改已保存');
    }
}


// 5. Local Storage Logic
async function saveConfig(silent = false) {
    if (appState.keys.length === 0) {
        // Allow saving empty state (clearing)
        localStorage.removeItem(STORAGE_KEY);
        if(!silent) showToast('配置已清空');
        return;
    }

    const encrypted = await encryptData(appState.keys);
    if (encrypted) {
        localStorage.setItem(STORAGE_KEY, encrypted);
        if(!silent) showToast('配置已保存');
    } else {
        if(!silent) showToast('保存失败 (加密错误)', 'error');
    }
}

async function loadConfig(silent = false) {
    const encrypted = localStorage.getItem(STORAGE_KEY);
    if (!encrypted) {
        if(!silent) showToast('本地没有找到保存的配置', 'warning');
        return;
    }

    const data = await decryptData(encrypted);
    
    // Handle migration from old object format to new array format
    if (data) {
        if (Array.isArray(data)) {
            appState.keys = data;
        } else if (data.apiKey) {
            // Convert old single object to array
            appState.keys = [{
                id: 'legacy_import',
                apiKey: data.apiKey,
                email: data.email,
                password: data.password,
                usage: null
            }];
        }
        
        renderKeyList();
        if(!silent) showToast('配置加载成功');
    } else {
        if(!silent) showToast('无法解密配置', 'error');
    }
}

function clearConfig() {
    if(confirm('确定要清除所有保存的密钥吗？')) {
        appState.keys = [];
        localStorage.removeItem(STORAGE_KEY);
        renderKeyList();
        showToast('配置已清除');
    }
}

// 6. UI Rendering & Interaction
function renderKeyList() {
    const tbody = document.getElementById('keyListBody');
    const emptyState = document.getElementById('emptyState');
    const totalStats = document.getElementById('totalStatsCard');

    if (appState.keys.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        totalStats.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    
    let totalUsed = 0;
    let totalLimit = 0;
    let hasUsageData = false;

    tbody.innerHTML = appState.keys.map((k, index) => {
        // Usage Bar Logic
        let usageHtml = '<span class="text-muted small">未查询</span>';
        if (k.usage) {
            hasUsageData = true;
            totalUsed += k.usage.character_count || 0;
            totalLimit += k.usage.character_limit || 0;
            
            const used = k.usage.character_count;
            const limit = k.usage.character_limit;
            const pct = limit > 0 ? (used / limit * 100) : 0;
            
            let colorClass = 'bg-success';
            if (pct > 90) colorClass = 'bg-danger';
            else if (pct > 50) colorClass = 'bg-warning';

            usageHtml = `
                <div class="d-flex align-items-center">
                    <div class="flex-grow-1 me-2">
                        <div class="progress" style="height: 6px;">
                            <div class="progress-bar ${colorClass}" role="progressbar" style="width: ${pct}%"></div>
                        </div>
                    </div>
                    <span class="small text-muted">${Math.round(pct)}%</span>
                </div>
                <div class="small text-muted mt-1">
                    ${(used/1000).toFixed(1)}k / ${(limit/1000).toFixed(0)}k
                </div>
            `;
        } else if (k.error) {
             usageHtml = `<span class="text-danger small"><i class="bi bi-exclamation-circle"></i> ${k.error}</span>`;
        }

        // Mask Key
        const maskedKey = k.apiKey.substring(0, 4) + '...' + k.apiKey.substring(k.apiKey.length - 4);

        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div class="fw-bold text-dark">${k.email || '无账户信息'}</div>
                    <div class="small text-muted">${k.password ? '******' : ''}</div>
                </td>
                <td>
                    <code class="text-primary">${maskedKey}</code>
                </td>
                <td>
                    ${usageHtml}
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary" id="btn_q_${k.id}" onclick="checkOne('${k.id}')" title="查询此 Key">
                        <i class="bi bi-arrow-clockwise"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-info" onclick="copyOne('${k.apiKey}')" title="复制 Key">
                        <i class="bi bi-clipboard"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="editOne('${k.id}')" title="编辑">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteOne('${k.id}')" title="删除">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Update Totals
    if (hasUsageData) {
        totalStats.style.display = 'block';
        document.getElementById('totalUsed').textContent = totalUsed.toLocaleString();
        document.getElementById('totalLimit').textContent = totalLimit.toLocaleString();
    } else {
        totalStats.style.display = 'none';
    }
    
    // Ensure cooldown state is respected after re-render
    updateButtonStates();
}

function copyOne(key) {
    navigator.clipboard.writeText(key).then(() => {
        showToast('API Key 已复制到剪贴板');
    }).catch(err => {
        showToast('复制失败: ' + err, 'error');
    });
}

function deleteOne(id) {
    currentDeleteId = id;
    deleteModal.show();
}

function confirmDelete() {
    if (currentDeleteId) {
        appState.keys = appState.keys.filter(k => k.id !== currentDeleteId);
        renderKeyList();
        saveConfig();
        deleteModal.hide();
        currentDeleteId = null;
        showToast('删除成功');
    }
}

async function checkOne(id) {
    if (isCooldown) {
        showToast('请等待倒计时结束', 'warning');
        return;
    }

    const keyObj = appState.keys.find(k => k.id === id);
    if (!keyObj) return;

    triggerCooldown();

    // UI Feedback
    const btn = document.getElementById(`btn_q_${id}`);
    if(btn) {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
        btn.disabled = true;
        
        try {
            const result = await fetchUsage(keyObj.apiKey);
            keyObj.usage = result;
            keyObj.error = null;
            showToast('查询成功');
        } catch (e) {
            keyObj.usage = null;
            keyObj.error = e.message; // Use detailed message
            // showToast(e.message, 'error'); // Optional: show toast too? Maybe too noisy.
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }
    
    renderKeyList();
    saveConfig(true); // Silent save
}

// Global Cooldown Helper (variable moved to top)
let cooldownRemaining = 0;

function triggerCooldown() {
    isCooldown = true;
    cooldownRemaining = 10;
    updateButtonStates();
    
    if (cooldownTimer) clearInterval(cooldownTimer);
    
    cooldownTimer = setInterval(() => {
        cooldownRemaining--;
        if (cooldownRemaining <= 0) {
            clearInterval(cooldownTimer);
            isCooldown = false;
            cooldownRemaining = 0;
            updateButtonStates();
        } else {
            updateButtonStates();
        }
    }, 1000);
}

function updateButtonStates() {
    const buttons = document.querySelectorAll('button[onclick^="check"]');
    buttons.forEach(btn => {
        btn.disabled = isCooldown;
        // Optional: show countdown text inside button?
        // But renderKeyList overwrites innerHTML. 
        // We can just add a global indicator or modify the button text temporarily if we want.
        // Or better: update the button icon to show number?
        
        if (isCooldown) {
             // Find the icon or span inside
             // If we want to show countdown, we can append it
             // But since we have multiple buttons, maybe just disabled is enough?
             // User asked: "显示倒计时" (Show countdown)
             // Let's replace the icon with the number temporarily
             btn.innerHTML = `<span class="fw-bold">${cooldownRemaining}s</span>`;
        } else {
            // Restore icon (Need to know which icon. It is always arrow-clockwise for checkOne)
            btn.innerHTML = `<i class="bi bi-arrow-clockwise"></i>`;
        }
    });
}


// Helper to fetch
async function fetchUsage(apiKey) {
    const response = await fetch(`api.php?t=${Date.now()}`, {
        method: 'GET',
        headers: {
            'X-DeepL-Auth-Key': apiKey,
            'X-CSRF-Token': csrfToken,
            'Content-Type': 'application/json'
        }
    });
    
    const data = await response.json();
    if (!response.ok) {
        // Construct detailed error message
        let msg = data.message || 'Error';
        if (data.detail) {
            msg += `: ${data.detail}`;
        }
        throw new Error(msg);
    }
    return data;
}

// Old functions removed/replaced: toggleVisibility, checkUsage (replaced by checkOne/All)


// 7. History Logic
function addToHistory(success, data) {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    
    const record = {
        timestamp: new Date().toLocaleString(),
        success: success,
        details: success ? 
            `已用: ${data.character_count} / ${data.character_limit}` : 
            `失败: ${data.error || 'Unknown error'}`
    };

    // Add to beginning
    history.unshift(record);
    
    // Keep only last 5
    if (history.length > 5) {
        history = history.slice(0, 5);
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

    if (history.length === 0) {
        list.innerHTML = '<div class="list-group-item text-center text-muted py-4">暂无历史记录</div>';
        return;
    }

    list.innerHTML = history.map(item => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
            <div>
                <span class="badge ${item.success ? 'bg-success' : 'bg-danger'} me-2">
                    ${item.success ? '成功' : '失败'}
                </span>
                <span class="small text-muted">${item.timestamp}</span>
            </div>
            <div class="small fw-bold">
                ${item.details}
            </div>
        </div>
    `).join('');
}

function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});
