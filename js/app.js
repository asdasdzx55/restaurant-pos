/**
 * CodeArt Cloud POS & ERP - النظام السحابي الشامل لإدارة المطاعم
 * يشمل: نقطة البيع، خريطة الطاولات، شؤون الموظفين والرواتب، المصاريف، والتقارير المالية
 */

// المطاعم التجريبية الجاهزة من قاعدة بيانات المنيو
const DEMO_PRESETS = {
    'al-madina': {
        user: 'al-madina',
        token: '8d7b85eba56b8091c674de6b262c4ffe',
        storeName: 'مطعم المدينة',
        phone: '0501234567'
    },
    'chixee': {
        user: 'chixee',
        token: '38e5b7fad28a79d316937d54e44969a6',
        storeName: 'Chixee.fc',
        phone: '0559876543'
    },
    'tajin': {
        user: 'tajin-restaurant',
        token: '4e0f1268ee7c796c813a67ef74951e17',
        storeName: 'مطعم طاجن',
        phone: '0543210987'
    }
};

const defaultApiUrl = (typeof window !== 'undefined' && window.location.protocol.startsWith('http') && !window.location.origin.includes('github.io') && !window.location.origin.includes('127.0.0.1'))
    ? window.location.origin + '/api.php'
    : 'https://codeart.almagd555.com/api.php';

// =============================================================================
// الحالة العامة للنظام (Application State)
// =============================================================================
const state = {
    currentView: 'pos',
    settings: {
        apiUrl: defaultApiUrl,
        user: 'al-madina',
        token: '8d7b85eba56b8091c674de6b262c4ffe',
        storeName: 'مطعم المدينة',
        phone: '0501234567',
        currency: 'ر.س',
        taxPercent: 15,
        printerWidth: '80mm',
        autoPrint: true,
        soundAlert: true,
        pollInterval: 5000,
        receiptFooter: 'شكراً لزيارتكم ونتمنى لكم وجبة شهية!'
    },
    categories: [],
    items: [],
    selectedCategoryId: 'all',
    searchQuery: '',
    cart: [],
    orderType: 'dinein',
    tableNumber: 'طاولة 1',
    activeTableId: null,
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    pendingOrders: [],
    printedOrderIds: new Set(),
    isPolling: false,
    pollTimer: null,
    activeItemForModal: null,

    // أنظمة ERP الإضافية
    tables: [],
    employees: [],
    payroll: [],
    expenses: [],
    ordersHistory: []
};

// =============================================================================
// التهيئة الأولية للتطبيق (Initialization)
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
    loadSettingsFromStorage();
    loadERPData();
    initEventListeners();
    updateUIConnectionStatus(false, 'جاري فحص الاتصال...');

    // بدء المزامنة والاستماع للطلبات
    if (state.settings.apiUrl && state.settings.user && state.settings.token) {
        syncMenuData();
        startOrderPolling();
    } else {
        openModal('settings-modal');
    }

    // تحديث الإحصائيات الأولية
    renderTables();
    renderHR();
    renderExpenses();
    renderReports();
});

// =============================================================================
// نظام التبديل بين الشاشات (Navigation View Switcher)
// =============================================================================
function switchView(viewName) {
    state.currentView = viewName;

    // تحديث أزرار التنقل
    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-btn-${viewName}`);
    if (activeBtn) activeBtn.classList.add('active');

    // إظهار الصفحة المطلوبة
    document.querySelectorAll('.view-page').forEach(page => page.classList.remove('active'));
    const targetPage = document.getElementById(`view-${viewName}`);
    if (targetPage) targetPage.classList.add('active');

    // تحديث محتوى الصفحة النشطة
    if (viewName === 'tables') renderTables();
    if (viewName === 'hr') renderHR();
    if (viewName === 'expenses') renderExpenses();
    if (viewName === 'reports') renderReports();
    if (viewName === 'pos') renderCart();
}

// =============================================================================
// إدارة البيانات المحلية (Local Storage Persistence for ERP)
// =============================================================================
function loadERPData() {
    // 1. الطاولات
    const savedTables = localStorage.getItem('codeart_pos_tables');
    if (savedTables) {
        try { state.tables = JSON.parse(savedTables); } catch(e) {}
    }
    if (!state.tables || state.tables.length === 0) {
        state.tables = [
            { id: 1, name: 'طاولة 1', seats: 4, status: 'vacant', orderItems: [], orderTotal: 0, openedAt: null },
            { id: 2, name: 'طاولة 2', seats: 2, status: 'vacant', orderItems: [], orderTotal: 0, openedAt: null },
            { id: 3, name: 'طاولة 3', seats: 6, status: 'occupied', orderItems: [{ name: 'زنجر المدينة', price: 200, quantity: 2 }, { name: 'سفن اب', price: 60, quantity: 2 }], orderTotal: 520, openedAt: '12:30 م' },
            { id: 4, name: 'طاولة 4', seats: 4, status: 'vacant', orderItems: [], orderTotal: 0, openedAt: null },
            { id: 5, name: 'طاولة 5', seats: 8, status: 'vacant', orderItems: [], orderTotal: 0, openedAt: null },
            { id: 6, name: 'VIP 1', seats: 6, status: 'billed', orderItems: [{ name: 'وجبة زنجر المدينة', price: 300, quantity: 3 }], orderTotal: 900, openedAt: '01:15 م' }
        ];
        saveTables();
    }

    // 2. الموظفون
    const savedEmployees = localStorage.getItem('codeart_pos_employees');
    if (savedEmployees) {
        try { state.employees = JSON.parse(savedEmployees); } catch(e) {}
    }
    if (!state.employees || state.employees.length === 0) {
        state.employees = [
            { id: 1, name: 'أحمد محمود حسن', role: 'شيف رئيسي', phone: '0501122334', salary: 4500, salaryType: 'شهري', hireDate: '2025-01-10' },
            { id: 2, name: 'سامر خالد العلي', role: 'كاشير', phone: '0559988776', salary: 3200, salaryType: 'شهري', hireDate: '2025-03-01' },
            { id: 3, name: 'محمود عبد الله', role: 'ويتر (مقدم طعام)', phone: '0543322110', salary: 2800, salaryType: 'شهري', hireDate: '2025-05-15' },
            { id: 4, name: 'كريم يوسف', role: 'عامل توصيل (ديليفري)', phone: '0567788990', salary: 2600, salaryType: 'شهري', hireDate: '2025-06-20' }
        ];
        saveEmployees();
    }

    // 3. سجل مسير الرواتب
    const savedPayroll = localStorage.getItem('codeart_pos_payroll');
    if (savedPayroll) {
        try { state.payroll = JSON.parse(savedPayroll); } catch(e) {}
    }

    // 4. المصاريف
    const savedExpenses = localStorage.getItem('codeart_pos_expenses');
    if (savedExpenses) {
        try { state.expenses = JSON.parse(savedExpenses); } catch(e) {}
    }
    if (!state.expenses || state.expenses.length === 0) {
        state.expenses = [
            { id: 101, date: new Date().toLocaleDateString('ar-SA'), time: '09:30 ص', category: 'لحوم ودواجن', amount: 850, method: 'كاش (من درج الكاشير)', payee: 'ملحمة الأمانة', notes: 'شراء 25 كجم دجاج ولحم عجل' },
            { id: 102, date: new Date().toLocaleDateString('ar-SA'), time: '11:00 ص', category: 'خضار وفواكه', amount: 220, method: 'كاش (من درج الكاشير)', payee: 'سوق الخضار المركزي', notes: 'طماطم، خس، بصل، ليمون' }
        ];
        saveExpenses();
    }

    // 5. سجل الفواتير والمبيعات
    const savedOrders = localStorage.getItem('codeart_pos_orders_history');
    if (savedOrders) {
        try { state.ordersHistory = JSON.parse(savedOrders); } catch(e) {}
    }

    // 6. ذاكرة المنيو المحلي (Offline-First Menu Cache)
    const cachedMenu = localStorage.getItem('codeart_pos_menu_cache');
    if (cachedMenu) {
        try {
            const parsed = JSON.parse(cachedMenu);
            if (parsed.items && parsed.items.length > 0) {
                state.categories = parsed.categories || [];
                state.items = parsed.items || [];
                renderCategories();
                renderItems();
            }
        } catch(e) {}
    }

    // 7. قائمة الطلبات المعلقة للإرسال عند عودة النت (Offline Queue)
    const savedQueue = localStorage.getItem('codeart_pos_offline_queue');
    if (savedQueue) {
        try { state.offlineOrdersQueue = JSON.parse(savedQueue); } catch(e) {}
    }
}

function saveTables() { localStorage.setItem('codeart_pos_tables', JSON.stringify(state.tables)); }
function saveEmployees() { localStorage.setItem('codeart_pos_employees', JSON.stringify(state.employees)); }
function savePayroll() { localStorage.setItem('codeart_pos_payroll', JSON.stringify(state.payroll)); }
function saveExpenses() { localStorage.setItem('codeart_pos_expenses', JSON.stringify(state.expenses)); }
function saveOfflineQueue() { localStorage.setItem('codeart_pos_offline_queue', JSON.stringify(state.offlineOrdersQueue || [])); }
function saveOrdersHistory() { localStorage.setItem('codeart_pos_orders_history', JSON.stringify(state.ordersHistory)); }

// =============================================================================
// إعدادات الربط والمنيو
// =============================================================================
function loadSettingsFromStorage() {
    const saved = localStorage.getItem('codeart_pos_settings');
    if (saved) {
        try { state.settings = { ...state.settings, ...JSON.parse(saved) }; } catch (e) {}
    }
    applySettingsToDOM();
}

function saveSettingsToStorage() {
    localStorage.setItem('codeart_pos_settings', JSON.stringify(state.settings));
}

function applySettingsToDOM() {
    document.getElementById('brand-store-name').textContent = state.settings.storeName || 'كاشير المطعم';
    document.getElementById('input-api-url').value = state.settings.apiUrl || '';
    document.getElementById('input-username').value = state.settings.user || '';
    document.getElementById('input-token').value = state.settings.token || '';
    document.getElementById('input-store-name').value = state.settings.storeName || '';
    document.getElementById('input-store-phone').value = state.settings.phone || '';
    document.getElementById('input-currency').value = state.settings.currency || 'ر.س';
    document.getElementById('input-tax').value = state.settings.taxPercent;
    document.getElementById('select-printer-width').value = state.settings.printerWidth || '80mm';
    document.getElementById('check-auto-print').checked = state.settings.autoPrint;
    document.getElementById('check-sound-alert').checked = state.settings.soundAlert;
    document.getElementById('input-receipt-footer').value = state.settings.receiptFooter || '';
}

function applyDemoPreset(key) {
    const preset = DEMO_PRESETS[key];
    if (!preset) return;

    const apiInput = document.getElementById('input-api-url');
    if (!apiInput.value || apiInput.value.includes('example.com')) {
        apiInput.value = 'http://127.0.0.1:8080/api.php';
    }
    document.getElementById('input-username').value = preset.user;
    document.getElementById('input-token').value = preset.token;
    document.getElementById('input-store-name').value = preset.storeName;
    if (preset.phone) document.getElementById('input-store-phone').value = preset.phone;
    showToast(`تم اختيار ${preset.storeName}! اضغط "حفظ وبدء المزامنة"`, 'info');
}

// =============================================================================
// نغمة التنبيه الصوتية (Web Audio API Synthesizer)
// =============================================================================
function playNotificationChime() {
    if (!state.settings.soundAlert) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const playTone = (freq, startTime, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0.3, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration);
        };
        const now = ctx.currentTime;
        playTone(587.33, now, 0.25);
        playTone(880.00, now + 0.15, 0.45);
        playTone(1174.66, now + 0.35, 0.7);
    } catch (err) {}
}

// =============================================================================
// المزامنة مع سيرفر المنيو (API Client) مع دعم Offline-First
// =============================================================================
async function syncMenuData() {
    if (!state.settings.apiUrl || !state.settings.user || !state.settings.token) return;

    updateUIConnectionStatus('syncing', 'جاري المزامنة مع المنيو...');
    const url = new URL(state.settings.apiUrl);
    url.searchParams.set('action', 'get_items');
    url.searchParams.set('user', state.settings.user);
    url.searchParams.set('token', state.settings.token);

    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        const data = await response.json();
        if (data.status === 'success') {
            state.categories = data.categories || [];
            state.items = data.items || [];
            renderCategories();
            renderItems();

            // حفظ نسخة احتياطية محلية للعمل الدائم بدون إنترنت
            localStorage.setItem('codeart_pos_menu_cache', JSON.stringify({
                categories: state.categories,
                items: state.items
            }));

            updateUIConnectionStatus(true, 'متصل بسيرفر المنيو');
            showToast('تم تحديث قائمة الأصناف بنجاح!', 'success');
        } else {
            throw new Error(data.message || 'فشل جلب البيانات');
        }
    } catch (err) {
        console.warn("تعذر الاتصال بالمنيو السحابي، جاري العمل من الذاكرة المحلية (Offline):", err);
        if (state.items && state.items.length > 0) {
            updateUIConnectionStatus('offline', 'يعمل بدون إنترنت (Offline)');
        } else {
            updateUIConnectionStatus(false, 'غير متصل: ' + err.message);
        }
    }
}

function updateUIConnectionStatus(status, text) {
    const badge = document.getElementById('connection-badge');
    const textEl = document.getElementById('connection-text');
    badge.className = 'api-status-badge';
    if (status === true || status === 'connected') badge.classList.add('connected');
    else if (status === 'syncing') badge.classList.add('syncing');
    else if (status === 'offline') badge.classList.add('offline');
    textEl.textContent = text;
}

// =============================================================================
// 1️⃣ إدارة نقطة البيع (POS Menu & Cart Engine)
// =============================================================================
function renderCategories() {
    const container = document.getElementById('categories-container');
    container.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = `category-tab ${state.selectedCategoryId === 'all' ? 'active' : ''}`;
    allBtn.textContent = '🌟 الكل';
    allBtn.onclick = () => {
        state.selectedCategoryId = 'all';
        renderCategories();
        renderItems();
    };
    container.appendChild(allBtn);

    state.categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `category-tab ${state.selectedCategoryId == cat.id ? 'active' : ''}`;
        btn.textContent = cat.name;
        btn.onclick = () => {
            state.selectedCategoryId = cat.id;
            renderCategories();
            renderItems();
        };
        container.appendChild(btn);
    });
}

function renderItems() {
    const grid = document.getElementById('items-grid');
    grid.innerHTML = '';
    let filtered = state.items;

    if (state.selectedCategoryId !== 'all') {
        filtered = filtered.filter(it => it.category_id == state.selectedCategoryId);
    }

    if (state.searchQuery.trim() !== '') {
        const q = state.searchQuery.toLowerCase().trim();
        filtered = filtered.filter(it => 
            (it.name && it.name.toLowerCase().includes(q)) || 
            (it.name_en && it.name_en.toLowerCase().includes(q))
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #94a3b8;">لم يتم العثور على أصناف.</div>`;
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        const hasOptions = item.has_variations && item.variations && item.variations.length > 0;
        const imgHtml = item.image_url && item.image_url.trim() !== ''
            ? `<img src="${item.image_url}" alt="${item.name}" onerror="this.src=''; this.parentElement.innerHTML='<i class=\\'fas fa-utensils placeholder-icon\\'></i>'">`
            : `<i class="fas fa-utensils placeholder-icon"></i>`;

        card.innerHTML = `
            <div class="item-img-box">${imgHtml}</div>
            <div class="item-card-body">
                <div class="item-title" title="${item.name}">${item.name}</div>
                <div class="item-price-row">
                    <span class="item-price">${Number(item.price).toFixed(2)} ${state.settings.currency}</span>
                    ${hasOptions ? '<span class="has-options-tag">خيارات</span>' : ''}
                </div>
            </div>
        `;
        card.onclick = () => handleItemClick(item);
        grid.appendChild(card);
    });
}

function handleItemClick(item) {
    if (item.has_variations && item.variations && item.variations.length > 0) {
        openVariationsModal(item);
    } else {
        addToCart(item, null, 0);
    }
}

function openVariationsModal(item) {
    state.activeItemForModal = item;
    document.getElementById('modal-item-name').textContent = item.name;
    const container = document.getElementById('variations-list');
    container.innerHTML = '';
    item.variations.forEach((v, idx) => {
        const label = document.createElement('label');
        label.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; cursor: pointer; background: #f8fafc;`;
        const vPrice = Number(v.price || item.price);
        label.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="radio" name="variation_choice" value="${idx}" ${idx === 0 ? 'checked' : ''}>
                <span style="font-weight: 700;">${v.name || v.title || ('خيار ' + (idx + 1))}</span>
            </div>
            <span style="font-weight: 800; color: var(--primary);">${vPrice.toFixed(2)} ${state.settings.currency}</span>
        `;
        container.appendChild(label);
    });
    openModal('variations-modal');
}

function confirmVariationSelection() {
    const selectedRadio = document.querySelector('input[name="variation_choice"]:checked');
    if (!selectedRadio || !state.activeItemForModal) return;
    const idx = parseInt(selectedRadio.value);
    const variation = state.activeItemForModal.variations[idx];
    const price = Number(variation.price || state.activeItemForModal.price);
    const name = variation.name || variation.title || ('خيار ' + (idx + 1));
    addToCart(state.activeItemForModal, name, price);
    closeModal('variations-modal');
}

function addToCart(item, variationName, customPrice) {
    const effectivePrice = customPrice > 0 ? customPrice : Number(item.price);
    const cartItemId = variationName ? `${item.id}_${variationName}` : `${item.id}`;
    const existingIndex = state.cart.findIndex(c => c.cartItemId === cartItemId);
    if (existingIndex > -1) {
        state.cart[existingIndex].quantity += 1;
    } else {
        state.cart.push({
            cartItemId,
            itemId: item.id,
            name: item.name,
            variation: variationName || null,
            price: effectivePrice,
            quantity: 1
        });
    }
    renderCart();

    // إذا كانت طاولة محددة، احفظ الطلب عليها فوراً
    if (state.activeTableId) {
        const table = state.tables.find(t => t.id === state.activeTableId);
        if (table) {
            table.status = 'occupied';
            table.orderItems = [...state.cart];
            table.orderTotal = state.cart.reduce((s, it) => s + (it.price * it.quantity), 0);
            if (!table.openedAt) table.openedAt = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
            saveTables();
        }
    }
}

function updateCartItemQty(cartItemId, delta) {
    const item = state.cart.find(c => c.cartItemId === cartItemId);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) {
        state.cart = state.cart.filter(c => c.cartItemId !== cartItemId);
    }
    renderCart();
}

function removeCartItem(cartItemId) {
    state.cart = state.cart.filter(c => c.cartItemId !== cartItemId);
    renderCart();
}

function clearCart() {
    state.cart = [];
    state.activeTableId = null;
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items-list');
    const emptyState = document.getElementById('empty-cart-state');
    const btnCheckout = document.getElementById('btn-checkout');

    if (state.cart.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'flex';
        btnCheckout.disabled = true;
        updateTotals(0);
        return;
    }

    emptyState.style.display = 'none';
    btnCheckout.disabled = false;
    container.innerHTML = '';
    let subtotal = 0;

    state.cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        const row = document.createElement('div');
        row.className = 'cart-item-row';
        row.innerHTML = `
            <div class="cart-item-header">
                <div>
                    <div class="cart-item-title">${item.name}</div>
                    ${item.variation ? `<div class="cart-item-option-label">🔹 ${item.variation}</div>` : ''}
                </div>
                <button class="btn-remove-item" onclick="removeCartItem('${item.cartItemId}')"><i class="fas fa-trash-alt"></i></button>
            </div>
            <div class="cart-item-controls">
                <div class="stepper">
                    <button onclick="updateCartItemQty('${item.cartItemId}', -1)">-</button>
                    <span>${item.quantity}</span>
                    <button onclick="updateCartItemQty('${item.cartItemId}', 1)">+</button>
                </div>
                <div class="cart-item-subtotal">${itemTotal.toFixed(2)} ${state.settings.currency}</div>
            </div>
        `;
        container.appendChild(row);
    });

    updateTotals(subtotal);
}

function updateTotals(subtotal) {
    const taxRate = (state.settings.taxPercent || 0) / 100;
    const taxAmount = subtotal * taxRate;
    const grandTotal = subtotal + taxAmount;
    document.getElementById('summary-subtotal').textContent = `${subtotal.toFixed(2)} ${state.settings.currency}`;
    document.getElementById('summary-tax').textContent = `${taxAmount.toFixed(2)} ${state.settings.currency}`;
    document.getElementById('summary-total').textContent = `${grandTotal.toFixed(2)} ${state.settings.currency}`;
}

async function submitOrder() {
    if (state.cart.length === 0) return;
    const subtotal = state.cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    const taxRate = (state.settings.taxPercent || 0) / 100;
    const grandTotal = subtotal + (subtotal * taxRate);

    const itemsFormatted = state.cart.map(c => ({
        id: c.itemId,
        name: c.name + (c.variation ? ` (${c.variation})` : ''),
        price: c.price,
        quantity: c.quantity
    }));

    const tableLabel = document.getElementById('table-num-input').value.trim() || 'طاولة 1';
    const orderPayload = {
        username: state.settings.user,
        customer_name: state.orderType === 'delivery' ? (document.getElementById('cust-name').value || 'عميل توصيل') : 'عميل المطعم',
        customer_phone: state.orderType === 'delivery' ? (document.getElementById('cust-phone').value || '') : '',
        customer_address: state.orderType === 'delivery' ? (document.getElementById('cust-address').value || '') : '',
        table_number: state.orderType === 'dinein' ? tableLabel : '',
        order_type: state.orderType,
        items: itemsFormatted,
        total_price: grandTotal,
        created_at: new Date().toLocaleTimeString('ar-SA')
    };

    let orderId = Date.now().toString().slice(-4);
    let isSyncedOnline = false;

    // تسجيل الطلب في السيرفر عبر الـ API إذا كان النت متوفراً
    try {
        if (navigator.onLine && state.settings.apiUrl && state.settings.user) {
            const url = new URL(state.settings.apiUrl);
            url.searchParams.set('action', 'create_order');
            const res = await fetch(url.toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderPayload)
            });
            const resData = await res.json();
            if (resData.status === 'success' && resData.order_id) {
                orderId = resData.order_id;
                isSyncedOnline = true;
            }
        }
    } catch (e) {
        console.warn("تعذر الاتصال بالسيرفر، سيتم حفظ الطلب في قائمة الانتظار للمزامنة:", e);
    }

    // إذا تعذر الإرسال أو كنا بدون نت، نضيف لقائمة الانتظار الأوفلاين
    if (!isSyncedOnline) {
        if (!state.offlineOrdersQueue) state.offlineOrdersQueue = [];
        state.offlineOrdersQueue.push(orderPayload);
        saveOfflineQueue();
    }

    // حفظ في سجل المبيعات المحلي
    orderPayload.id = orderId;
    state.ordersHistory.unshift(orderPayload);
    saveOrdersHistory();

    // إذا كانت الطاولة مفعلة، إخلاؤها
    if (state.activeTableId) {
        const table = state.tables.find(t => t.id === state.activeTableId);
        if (table) {
            table.status = 'vacant';
            table.orderItems = [];
            table.orderTotal = 0;
            table.openedAt = null;
            saveTables();
        }
    }

    // طباعة الفاتورة الحرارية
    triggerPrint(orderPayload);
    showToast(`تم تسجيل الفاتورة #${orderId} بنجاح!`, 'success');
    clearCart();
    renderReports();
}

// =============================================================================
// 2️⃣ إدارة الطاولات وخريطة الصالة (Floor Plan Engine)
// =============================================================================
function renderTables() {
    const grid = document.getElementById('tables-grid-container');
    if (!grid) return;
    grid.innerHTML = '';

    const total = state.tables.length;
    const vacant = state.tables.filter(t => t.status === 'vacant').length;
    const occupied = state.tables.filter(t => t.status === 'occupied' || t.status === 'billed').length;
    const revenue = state.tables.reduce((sum, t) => sum + (t.orderTotal || 0), 0);

    document.getElementById('kpi-total-tables').textContent = total;
    document.getElementById('kpi-vacant-tables').textContent = vacant;
    document.getElementById('kpi-occupied-tables').textContent = occupied;
    document.getElementById('kpi-tables-revenue').textContent = `${revenue.toFixed(2)} ${state.settings.currency}`;

    state.tables.forEach(table => {
        const card = document.createElement('div');
        const statusClass = table.status === 'vacant' ? 'vacant' : (table.status === 'occupied' ? 'occupied' : 'billed');
        const statusText = table.status === 'vacant' ? 'فارغة (متاحة)' : (table.status === 'occupied' ? 'مشغولة' : 'فاتورة مطلوبة');

        card.className = `table-card ${statusClass}`;
        card.innerHTML = `
            <div class="table-card-top">
                <div class="table-number-title">
                    <i class="fas fa-chair"></i>
                    <span>${table.name}</span>
                </div>
                <span class="table-status-pill ${statusClass}">${statusText}</span>
            </div>
            <div class="table-card-body">
                <div><i class="fas fa-user-friends"></i> السعة: ${table.seats || 4} كراسي</div>
                ${table.openedAt ? `<div><i class="fas fa-clock"></i> جلوس منذ: ${table.openedAt}</div>` : ''}
                ${table.orderItems && table.orderItems.length > 0 ? `<div><i class="fas fa-utensils"></i> الأصناف: ${table.orderItems.length} صنف</div>` : '<div style="color: #94a3b8;">لا توجد طلبات جارية</div>'}
                <div class="table-order-amount">${Number(table.orderTotal || 0).toFixed(2)} ${state.settings.currency}</div>
            </div>
            <div class="table-card-actions">
                <button class="table-btn primary" onclick="openTableInPOS(${table.id})">
                    <i class="fas fa-cart-plus"></i> ${table.status === 'vacant' ? 'فتح طلب' : 'تعديل الطلب'}
                </button>
                ${table.status !== 'vacant' ? `
                    <button class="table-btn success" onclick="checkoutTableDirectly(${table.id})" title="محاسبة وإخلاء">
                        <i class="fas fa-check"></i> محاسبة
                    </button>
                ` : `
                    <button class="table-btn danger" onclick="deleteTable(${table.id})" title="حذف الطاولة">
                        <i class="fas fa-trash"></i>
                    </button>
                `}
            </div>
        `;
        grid.appendChild(card);
    });
}

function openTableInPOS(tableId) {
    const table = state.tables.find(t => t.id === tableId);
    if (!table) return;

    state.activeTableId = table.id;
    state.orderType = 'dinein';
    document.getElementById('table-num-input').value = table.name;

    // استرجاع الأصناف إن وجدت
    if (table.orderItems && table.orderItems.length > 0) {
        state.cart = [...table.orderItems];
    } else {
        state.cart = [];
    }

    switchView('pos');
    showToast(`تم فتح ${table.name} في شاشة الكاشير`, 'info');
}

function checkoutTableDirectly(tableId) {
    const table = state.tables.find(t => t.id === tableId);
    if (!table || !table.orderItems || table.orderItems.length === 0) return;

    // فتح السلة فوراً ومحاسبتها
    state.activeTableId = table.id;
    state.cart = [...table.orderItems];
    document.getElementById('table-num-input').value = table.name;
    submitOrder();
}

function deleteTable(tableId) {
    if (!confirm('هل تريد حذف هذه الطاولة بالتأكيد؟')) return;
    state.tables = state.tables.filter(t => t.id !== tableId);
    saveTables();
    renderTables();
    showToast('تم حذف الطاولة', 'info');
}

// =============================================================================
// 3️⃣ شؤون الموظفين ومسير الرواتب (HR & Payroll Engine)
// =============================================================================
function renderHR() {
    const empTable = document.getElementById('employees-table-body');
    const payrollTable = document.getElementById('payroll-history-table-body');
    if (!empTable) return;

    // تحديث إحصائيات HR
    const totalEmp = state.employees.length;
    const totalSal = state.employees.reduce((sum, e) => sum + Number(e.salary || 0), 0);
    const paidMonth = state.payroll.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    document.getElementById('kpi-total-employees').textContent = totalEmp;
    document.getElementById('kpi-total-salaries').textContent = `${totalSal.toFixed(2)} ${state.settings.currency}`;
    document.getElementById('kpi-month-paid-salaries').textContent = `${paidMonth.toFixed(2)} ${state.settings.currency}`;

    // جدول الموظفين
    empTable.innerHTML = '';
    state.employees.forEach(emp => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong style="font-size: 0.95rem;">${emp.name}</strong></td>
            <td><span class="badge-tag role">${emp.role}</span></td>
            <td dir="ltr" style="text-align: right;">${emp.phone || '-'}</td>
            <td><strong style="color: var(--primary);">${Number(emp.salary).toFixed(2)} ${state.settings.currency}</strong></td>
            <td><span class="badge-tag salary">${emp.salaryType || 'شهري'}</span></td>
            <td>${emp.hireDate || '-'}</td>
            <td>
                <div class="action-btns-group">
                    <button class="action-btn pay" onclick="openPaySalaryModal(${emp.id})">
                        <i class="fas fa-hand-holding-usd"></i> صرف راتب
                    </button>
                    <button class="action-btn advance" onclick="openAddAdvanceModal(${emp.id})">
                        <i class="fas fa-money-bill"></i> سلفة
                    </button>
                    <button class="action-btn del" onclick="deleteEmployee(${emp.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        empTable.appendChild(tr);
    });

    // جدول سجل مسير الرواتب والسلف
    payrollTable.innerHTML = '';
    if (state.payroll.length === 0) {
        payrollTable.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">لا توجد سندات صرف رواتب أو سلف مسجلة بعد.</td></tr>`;
    } else {
        state.payroll.forEach((p, idx) => {
            const tr = document.createElement('tr');
            const typeBadge = p.type === 'راتب' ? '<span class="badge-tag salary">راتب</span>' : '<span class="badge-tag advance">سلفة / خصم</span>';
            const methodBadge = p.method.includes('كاش') ? '<span class="badge-tag cash">كاش</span>' : '<span class="badge-tag bank">بنك</span>';

            tr.innerHTML = `
                <td>#${p.id || (idx + 1)}</td>
                <td>${p.date}</td>
                <td><strong>${p.employeeName}</strong></td>
                <td>${typeBadge}</td>
                <td><strong style="color: var(--danger);">${Number(p.amount).toFixed(2)} ${state.settings.currency}</strong></td>
                <td>${methodBadge}</td>
                <td>${p.notes || '-'}</td>
                <td>
                    <button class="action-btn" onclick="printVoucherSlip(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                        <i class="fas fa-print"></i> سند
                    </button>
                </td>
            `;
            payrollTable.appendChild(tr);
        });
    }
}

function openPaySalaryModal(empId) {
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) return;
    document.getElementById('pay-emp-id').value = emp.id;
    document.getElementById('pay-emp-name').value = `${emp.name} (${emp.role})`;
    document.getElementById('pay-amount').value = emp.salary;
    document.getElementById('pay-period').value = new Date().toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' });
    openModal('pay-salary-modal');
}

function openAddAdvanceModal(empId) {
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) return;
    document.getElementById('adv-emp-id').value = emp.id;
    document.getElementById('adv-emp-name').value = `${emp.name} (${emp.role})`;
    document.getElementById('adv-amount').value = '';
    openModal('add-advance-modal');
}

function deleteEmployee(empId) {
    if (!confirm('هل تريد حذف هذا الموظف بالتأكيد؟')) return;
    state.employees = state.employees.filter(e => e.id !== empId);
    saveEmployees();
    renderHR();
    showToast('تم حذف الموظف بنجاح', 'info');
}

// =============================================================================
// 4️⃣ إدارة المصاريف والمشتريات (Expenses Engine)
// =============================================================================
function renderExpenses() {
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filterCat = document.getElementById('expense-filter-cat')?.value || 'all';
    const search = (document.getElementById('expense-search-input')?.value || '').toLowerCase().trim();

    let list = state.expenses;
    if (filterCat !== 'all') {
        list = list.filter(e => e.category === filterCat);
    }
    if (search !== '') {
        list = list.filter(e => (e.notes && e.notes.toLowerCase().includes(search)) || (e.payee && e.payee.toLowerCase().includes(search)));
    }

    // حساب إحصائيات المصاريف
    const totalExpenses = state.expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const cashExpenses = state.expenses.filter(e => e.method.includes('كاش')).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const bankExpenses = state.expenses.filter(e => !e.method.includes('كاش')).reduce((sum, e) => sum + Number(e.amount || 0), 0);

    document.getElementById('kpi-today-expenses').textContent = `${totalExpenses.toFixed(2)} ${state.settings.currency}`;
    document.getElementById('kpi-month-expenses').textContent = `${totalExpenses.toFixed(2)} ${state.settings.currency}`;
    document.getElementById('kpi-cash-expenses').textContent = `${cashExpenses.toFixed(2)} ${state.settings.currency}`;
    document.getElementById('kpi-bank-expenses').textContent = `${bankExpenses.toFixed(2)} ${state.settings.currency}`;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">لا توجد مصاريف مسجلة مطابقة.</td></tr>`;
        return;
    }

    list.forEach((exp, idx) => {
        const tr = document.createElement('tr');
        const methodBadge = exp.method.includes('كاش') ? '<span class="badge-tag cash">كاش من الدرج</span>' : '<span class="badge-tag bank">شبكة / بنك</span>';
        tr.innerHTML = `
            <td>#${exp.id || (idx + 1)}</td>
            <td>${exp.date} <small style="color: #94a3b8;">${exp.time || ''}</small></td>
            <td><span class="badge-tag expense">${exp.category}</span></td>
            <td><strong style="color: var(--danger); font-size: 1rem;">${Number(exp.amount).toFixed(2)} ${state.settings.currency}</strong></td>
            <td>${methodBadge}</td>
            <td>${exp.notes || '-'}</td>
            <td><strong>${exp.payee || '-'}</strong></td>
            <td>
                <div class="action-btns-group">
                    <button class="action-btn" onclick="printVoucherSlip(${JSON.stringify({
                        id: exp.id,
                        date: exp.date,
                        type: 'سند صرف مصروف - ' + exp.category,
                        employeeName: exp.payee || 'المورد',
                        amount: exp.amount,
                        method: exp.method,
                        notes: exp.notes
                    }).replace(/"/g, '&quot;')})">
                        <i class="fas fa-print"></i>
                    </button>
                    <button class="action-btn del" onclick="deleteExpense(${exp.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteExpense(expId) {
    if (!confirm('هل تريد حذف هذا المصروف؟')) return;
    state.expenses = state.expenses.filter(e => e.id !== expId);
    saveExpenses();
    renderExpenses();
    renderReports();
    showToast('تم حذف المصروف', 'info');
}

// =============================================================================
// 5️⃣ التقارير المالية وصافي الأرباح و Z-Report
// =============================================================================
function renderReports() {
    const daySales = state.ordersHistory.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
    const dayCashSales = state.ordersHistory.filter(o => o.order_type !== 'online').reduce((sum, o) => sum + Number(o.total_price || 0), 0) * 0.7; // محاكاة تقريبية للكاش والشبكة
    const dayCardSales = daySales - dayCashSales;

    const dayCosts = state.expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0) + state.payroll.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const dayCashCosts = state.expenses.filter(e => e.method.includes('كاش')).reduce((sum, e) => sum + Number(e.amount || 0), 0) + state.payroll.filter(p => p.method && p.method.includes('كاش')).reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const netProfit = daySales - dayCosts;
    const expectedDrawerCash = Math.max(0, dayCashSales - dayCashCosts);

    // تحديث الواجهة
    const netEl = document.getElementById('reports-net-profit');
    if (netEl) {
        netEl.textContent = `${netProfit.toFixed(2)} ${state.settings.currency}`;
        if (netProfit < 0) netEl.classList.add('negative');
        else netEl.classList.remove('negative');
    }

    document.getElementById('reports-day-sales').textContent = `${daySales.toFixed(2)} ${state.settings.currency}`;
    document.getElementById('reports-day-costs').textContent = `${dayCosts.toFixed(2)} ${state.settings.currency}`;
    document.getElementById('reports-cash-sales').textContent = `${dayCashSales.toFixed(2)} ${state.settings.currency}`;
    document.getElementById('reports-card-sales').textContent = `${dayCardSales.toFixed(2)} ${state.settings.currency}`;
    document.getElementById('reports-cash-deducted').textContent = `-${dayCashCosts.toFixed(2)} ${state.settings.currency}`;
    document.getElementById('reports-drawer-expected').textContent = `${expectedDrawerCash.toFixed(2)} ${state.settings.currency}`;

    // جدول الأصناف الأكثر مبيعاً
    const topItemsTable = document.getElementById('top-items-table-body');
    if (topItemsTable) {
        topItemsTable.innerHTML = '';
        const itemCounts = {};
        state.ordersHistory.forEach(ord => {
            const items = normalizeOrderItems(ord.items);
            items.forEach(it => {
                if (!itemCounts[it.name]) itemCounts[it.name] = { qty: 0, revenue: 0 };
                itemCounts[it.name].qty += it.quantity;
                itemCounts[it.name].revenue += (it.price * it.quantity);
            });
        });

        const sorted = Object.entries(itemCounts).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
        if (sorted.length === 0) {
            topItemsTable.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 15px;">لا توجد مبيعات مسجلة اليوم</td></tr>`;
        } else {
            sorted.forEach(([name, data]) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${name}</strong></td>
                    <td><span class="badge-tag role">${data.qty} وجبة</span></td>
                    <td><strong style="color: var(--primary);">${data.revenue.toFixed(2)} ${state.settings.currency}</strong></td>
                `;
                topItemsTable.appendChild(tr);
            });
        }
    }

    // جدول آخر فواتير اليوم
    const ordersTable = document.getElementById('today-orders-table-body');
    if (ordersTable) {
        ordersTable.innerHTML = '';
        const recent = state.ordersHistory.slice(0, 6);
        if (recent.length === 0) {
            ordersTable.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 15px;">لا توجد فواتير اليوم</td></tr>`;
        } else {
            recent.forEach(ord => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>#${ord.id}</td>
                    <td>${ord.created_at || '-'}</td>
                    <td>${ord.order_type === 'dinein' ? 'صالة' : (ord.order_type === 'delivery' ? 'توصيل' : 'سفري')}</td>
                    <td><strong>${Number(ord.total_price).toFixed(2)} ${state.settings.currency}</strong></td>
                `;
                ordersTable.appendChild(tr);
            });
        }
    }
}

// طباعة تقرير نهاية الوردية Z-Report على الطابعة الحرارية
function printZReport() {
    const container = document.getElementById('receipt-print-area');
    const widthClass = state.settings.printerWidth === '58mm' ? 'receipt-58mm' : '';

    const daySales = state.ordersHistory.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
    const dayCashSales = daySales * 0.7;
    const dayCardSales = daySales * 0.3;
    const dayCosts = state.expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const dayCashCosts = state.expenses.filter(e => e.method.includes('كاش')).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const netProfit = daySales - dayCosts;
    const drawerCash = Math.max(0, dayCashSales - dayCashCosts);

    container.innerHTML = `
        <div class="receipt-container ${widthClass}">
            <div class="receipt-header">
                <div class="receipt-store-title">${state.settings.storeName || 'المطعم'}</div>
                <div class="receipt-badge-type">تقرير إغلاق الوردية (Z-Report)</div>
                <div style="font-size: 10px; margin-top: 4px;">تاريخ التقرير: ${new Date().toLocaleString('ar-SA')}</div>
            </div>

            <div class="receipt-meta-row">
                <span>إجمالي عدد الفواتير:</span>
                <strong>${state.ordersHistory.length} فاتورة</strong>
            </div>
            <div class="receipt-meta-row">
                <span>إجمالي المبيعات الإجمالية:</span>
                <strong>${daySales.toFixed(2)} ${state.settings.currency}</strong>
            </div>

            <div style="border-top: 1px dashed #000; margin: 6px 0; padding-top: 6px;">
                <div class="receipt-meta-row">
                    <span>مبيعات نقدي (كاش):</span>
                    <span>${dayCashSales.toFixed(2)} ${state.settings.currency}</span>
                </div>
                <div class="receipt-meta-row">
                    <span>مبيعات شبكة (بطاقات):</span>
                    <span>${dayCardSales.toFixed(2)} ${state.settings.currency}</span>
                </div>
                <div class="receipt-meta-row" style="color: #000;">
                    <span>المصروفات النقدية من الدرج:</span>
                    <span>-${dayCashCosts.toFixed(2)} ${state.settings.currency}</span>
                </div>
            </div>

            <div class="receipt-totals" style="border-top: 1px solid #000; padding-top: 6px;">
                <div class="tot-row bold-total">
                    <span>صافي النقدية بالدرج:</span>
                    <span>${drawerCash.toFixed(2)} ${state.settings.currency}</span>
                </div>
                <div class="tot-row bold-total" style="font-size: 13px;">
                    <span>صافي الربح التقديري:</span>
                    <span>${netProfit.toFixed(2)} ${state.settings.currency}</span>
                </div>
            </div>

            <div style="margin-top: 15px; border-top: 1px dashed #000; padding-top: 10px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                    <span>توقيع الكاشير: ....................</span>
                    <span>توقيع المدير: ....................</span>
                </div>
            </div>

            <div class="receipt-footer">
                <p>CodeArt Cloud ERP & POS</p>
            </div>
        </div>
    `;

    window.print();
}

// طباعة سند صرف (راتب أو سلفة أو مصروف) على الطابعة الحرارية
function printVoucherSlip(voucher) {
    const container = document.getElementById('receipt-print-area');
    const widthClass = state.settings.printerWidth === '58mm' ? 'receipt-58mm' : '';

    container.innerHTML = `
        <div class="receipt-container ${widthClass}">
            <div class="receipt-header">
                <div class="receipt-store-title">${state.settings.storeName || 'المطعم'}</div>
                <div class="receipt-badge-type">${voucher.type || 'سند صرف رسمي'}</div>
                <div style="font-size: 10px;">رقم السند: #${voucher.id}</div>
                <div style="font-size: 10px;">التاريخ: ${voucher.date || new Date().toLocaleDateString('ar-SA')}</div>
            </div>

            <div class="receipt-meta-row">
                <span>يصرف إلى المكرم:</span>
                <strong>${voucher.employeeName}</strong>
            </div>
            <div class="receipt-meta-row">
                <span>المبلغ المصروف:</span>
                <strong style="font-size: 14px;">${Number(voucher.amount).toFixed(2)} ${state.settings.currency}</strong>
            </div>
            <div class="receipt-meta-row">
                <span>طريقة الدفع:</span>
                <span>${voucher.method}</span>
            </div>
            ${voucher.period ? `<div class="receipt-meta-row"><span>عن شهر / فترة:</span><span>${voucher.period}</span></div>` : ''}
            <div class="receipt-meta-row">
                <span>البيان / الملاحظات:</span>
                <span>${voucher.notes || 'تسليم مستحقات'}</span>
            </div>

            <div style="margin-top: 25px; border-top: 1px dashed #000; padding-top: 10px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                    <div>توقيع المستلم:<br><br>........................</div>
                    <div>توقيع المسؤول:<br><br>........................</div>
                </div>
            </div>

            <div class="receipt-footer">
                <p>تم الصرف بنجاح - حفظ الله الجميع</p>
            </div>
        </div>
    `;

    window.print();
}

// =============================================================================
// طباعة الفاتورة الحرارية للزبائن (Customer Thermal Receipt)
// =============================================================================
function normalizeOrderItems(rawItems) {
    if (!rawItems) return [];
    if (Array.isArray(rawItems)) {
        return rawItems.map(item => ({
            name: item.name || 'صنف',
            price: Number(item.price || 0),
            quantity: Number(item.quantity || item.qty || 1)
        }));
    }
    if (typeof rawItems === 'object') {
        return Object.entries(rawItems).map(([key, val]) => {
            if (val && typeof val === 'object') {
                return {
                    name: val.name || key,
                    price: Number(val.price || 0),
                    quantity: Number(val.qty || val.quantity || 1)
                };
            }
            return { name: key, price: 0, quantity: 1 };
        });
    }
    return [];
}

function triggerPrint(order) {
    const container = document.getElementById('receipt-print-area');
    const widthClass = state.settings.printerWidth === '58mm' ? 'receipt-58mm' : '';

    let typeTitle = 'طلب صالة';
    if (order.order_type === 'takeaway') typeTitle = 'طلب سفري';
    if (order.order_type === 'delivery') typeTitle = 'طلب توصيل';

    let itemsHtml = '';
    const itemsList = normalizeOrderItems(order.items);
    itemsList.forEach(item => {
        const qty = item.quantity || 1;
        const p = Number(item.price || 0);
        const sub = (p * qty).toFixed(2);
        itemsHtml += `
            <tr>
                <td style="text-align: right;">${item.name}</td>
                <td style="text-align: center;">${qty}</td>
                <td style="text-align: left;">${sub}</td>
            </tr>
        `;
    });

    const subtotal = Number(order.total_price || 0);
    const storeTitle = state.settings.storeName || 'المطعم';
    const storePhone = state.settings.phone ? `هاتف: ${state.settings.phone}` : '';
    const footerMsg = state.settings.receiptFooter || 'شكراً لزيارتكم!';

    container.innerHTML = `
        <div class="receipt-container ${widthClass}">
            <div class="receipt-header">
                <div class="receipt-store-title">${storeTitle}</div>
                <div>${storePhone}</div>
                <div class="receipt-badge-type">${typeTitle}</div>
            </div>

            <div class="receipt-meta-row">
                <span>رقم الطلب: #${order.id}</span>
                <span>${order.created_at || new Date().toLocaleTimeString('ar-SA')}</span>
            </div>
            ${order.table_number ? `<div class="receipt-meta-row"><span>الطاولة:</span><strong>${order.table_number}</strong></div>` : ''}
            ${order.customer_name ? `<div class="receipt-meta-row"><span>العميل:</span><span>${order.customer_name}</span></div>` : ''}
            ${order.customer_phone ? `<div class="receipt-meta-row"><span>الهاتف:</span><span>${order.customer_phone}</span></div>` : ''}
            ${order.customer_address ? `<div class="receipt-meta-row"><span>العنوان:</span><span>${order.customer_address}</span></div>` : ''}

            <table class="receipt-items-table">
                <thead>
                    <tr>
                        <th style="text-align: right;">الصنف</th>
                        <th style="text-align: center;">العدد</th>
                        <th style="text-align: left;">المجموع</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div class="receipt-totals">
                <div class="tot-row bold-total">
                    <span>الإجمالي المستحق:</span>
                    <span>${subtotal.toFixed(2)} ${state.settings.currency}</span>
                </div>
            </div>

            <div class="receipt-footer">
                <p>${footerMsg}</p>
                <p style="font-size: 9px; margin-top: 4px; color: #555;">CodeArt Cloud POS</p>
            </div>
        </div>
    `;

    window.print();
}

// =============================================================================
// الاستماع الحي للطلبات (Live Polling & Auto-Print)
// =============================================================================
function startOrderPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    const poll = async () => {
        if (!state.settings.apiUrl || !state.settings.user || !state.settings.token) return;
        try {
            const url = new URL(state.settings.apiUrl);
            url.searchParams.set('action', 'get_pending');
            url.searchParams.set('user', state.settings.user);
            url.searchParams.set('token', state.settings.token);

            const res = await fetch(url.toString());
            if (!res.ok) return;
            const data = await res.json();
            if (data.status === 'success' && Array.isArray(data.orders)) {
                handleIncomingOrders(data.orders);
            }
        } catch (e) {}
    };
    poll();
    state.pollTimer = setInterval(poll, state.settings.pollInterval || 5000);
}

function handleIncomingOrders(orders) {
    const newOrders = orders.filter(o => !state.printedOrderIds.has(o.id));
    const badge = document.getElementById('pending-orders-badge');

    if (orders.length > 0) {
        badge.style.display = 'flex';
        badge.textContent = orders.length;
    } else {
        badge.style.display = 'none';
    }

    state.pendingOrders = orders;
    renderIncomingOrdersModal();

    if (newOrders.length > 0) {
        playNotificationChime();
        newOrders.forEach(order => {
            state.printedOrderIds.add(order.id);
            showOrderNotificationToast(order);
            if (state.settings.autoPrint) {
                setTimeout(() => {
                    printAndAcknowledgeOrder(order);
                }, 600);
            }
        });
    }
}

function renderIncomingOrdersModal() {
    const body = document.getElementById('incoming-orders-list-body');
    if (!body) return;
    if (!state.pendingOrders || state.pendingOrders.length === 0) {
        body.innerHTML = `<div style="text-align: center; padding: 30px; color: #94a3b8;"><i class="fas fa-check-circle" style="font-size: 2.5rem; margin-bottom: 10px; color: #10b981; display: block;"></i>لا توجد طلبات معلقة حالياً، جميع الطلبات مطبوعة!</div>`;
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
    state.pendingOrders.forEach(order => {
        const items = normalizeOrderItems(order.items);
        const typeLabel = order.order_type === 'dinein' ? `صالة (طاولة ${order.table_number || '-'})` : (order.order_type === 'takeaway' ? 'سفري' : 'توصيل');
        const itemsSummary = items.map(i => `${i.name} × ${i.quantity}`).join('، ');

        html += `
            <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 800; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
                        <span>طلب #${order.id}</span>
                        <span style="font-size: 0.75rem; background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 4px;">${typeLabel}</span>
                        <span style="font-size: 0.75rem; color: #64748b;">${order.created_at || ''}</span>
                    </div>
                    <div style="font-size: 0.82rem; color: #475569; margin-top: 4px;">${itemsSummary}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-weight: 800; color: var(--primary);">${Number(order.total_price).toFixed(2)} ${state.settings.currency}</span>
                    <button class="btn-checkout" style="padding: 6px 14px; font-size: 0.85rem;" onclick="printAndAcknowledgeOrderById(${order.id})">
                        <i class="fas fa-print"></i> طباعة
                    </button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    body.innerHTML = html;
}

function showOrderNotificationToast(order) {
    const banner = document.getElementById('live-orders-banner');
    const toast = document.createElement('div');
    toast.className = 'order-notification-card';
    toast.id = `order-toast-${order.id}`;

    const items = normalizeOrderItems(order.items);
    const typeLabel = order.order_type === 'dinein' ? `طاولة #${order.table_number || '-'}` : (order.order_type === 'takeaway' ? 'سفري' : 'توصيل');

    toast.innerHTML = `
        <div class="notif-header">
            <span style="font-weight: 800; font-size: 0.95rem;">🔔 طلب جديد من المنيو #${order.id}</span>
            <span class="notif-badge">${typeLabel}</span>
        </div>
        <div style="font-size: 0.85rem; color: #cbd5e1;">المطلوب: ${items.map(i => `${i.name} (${i.quantity})`).join('، ')}</div>
        <div style="font-size: 0.9rem; font-weight: bold; color: #fbbf24;">الإجمالي: ${Number(order.total_price).toFixed(2)} ${state.settings.currency}</div>
        <div class="notif-actions">
            <button class="btn-notif-print" onclick="printAndAcknowledgeOrderById(${order.id})"><i class="fas fa-print"></i> طباعة وقبول</button>
            <button class="btn-notif-dismiss" onclick="dismissOrderToast(${order.id})">إغلاق</button>
        </div>
    `;
    banner.appendChild(toast);
}

function dismissOrderToast(orderId) {
    const toast = document.getElementById(`order-toast-${orderId}`);
    if (toast) toast.remove();
}

async function printAndAcknowledgeOrderById(orderId) {
    const order = state.pendingOrders.find(o => o.id == orderId);
    if (order) await printAndAcknowledgeOrder(order);
}

async function printAndAcknowledgeOrder(order) {
    dismissOrderToast(order.id);
    triggerPrint(order);

    state.ordersHistory.unshift(order);
    saveOrdersHistory();

    state.pendingOrders = state.pendingOrders.filter(o => o.id != order.id);
    const badge = document.getElementById('pending-orders-badge');
    if (state.pendingOrders.length > 0) badge.textContent = state.pendingOrders.length;
    else badge.style.display = 'none';

    renderIncomingOrdersModal();
    renderReports();

    try {
        const url = new URL(state.settings.apiUrl);
        url.searchParams.set('action', 'mark_printed');
        url.searchParams.set('user', state.settings.user);
        url.searchParams.set('token', state.settings.token);
        await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: order.id })
        });
    } catch (e) {}
}

// =============================================================================
// ربط النماذج والأحداث (Forms & Event Listeners)
// =============================================================================
function initEventListeners() {
    // بحث المنيو
    document.getElementById('search-input')?.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderItems();
    });

    // تبديل نوع الطلب في شاشة POS
    document.querySelectorAll('.type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.orderType = tab.dataset.type;
            const tableWrap = document.getElementById('table-input-wrapper');
            const deliveryWrap = document.getElementById('delivery-inputs-wrapper');
            if (state.orderType === 'dinein') {
                tableWrap.style.display = 'flex';
                deliveryWrap.style.display = 'none';
            } else if (state.orderType === 'delivery') {
                tableWrap.style.display = 'none';
                deliveryWrap.style.display = 'flex';
            } else {
                tableWrap.style.display = 'none';
                deliveryWrap.style.display = 'none';
            }
        });
    });

    // 1. نموذج إضافة طاولة جديدة
    document.getElementById('add-table-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('input-new-table-name').value.trim();
        const seats = parseInt(document.getElementById('input-new-table-seats').value) || 4;
        const notes = document.getElementById('input-new-table-notes').value.trim();

        const newTable = {
            id: Date.now(),
            name,
            seats,
            notes,
            status: 'vacant',
            orderItems: [],
            orderTotal: 0,
            openedAt: null
        };

        state.tables.push(newTable);
        saveTables();
        renderTables();
        closeModal('add-table-modal');
        showToast(`تمت إضافة ${name} بنجاح!`, 'success');
        e.target.reset();
    });

    // 2. نموذج إضافة موظف جديد
    document.getElementById('add-employee-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('input-emp-name').value.trim();
        const role = document.getElementById('input-emp-role').value;
        const phone = document.getElementById('input-emp-phone').value.trim();
        const salary = parseFloat(document.getElementById('input-emp-salary').value) || 0;
        const salaryType = document.getElementById('input-emp-type').value;

        const newEmp = {
            id: Date.now(),
            name,
            role,
            phone,
            salary,
            salaryType,
            hireDate: new Date().toISOString().split('T')[0]
        };

        state.employees.push(newEmp);
        saveEmployees();
        renderHR();
        closeModal('add-employee-modal');
        showToast(`تمت إضافة الموظف ${name} بنجاح!`, 'success');
        e.target.reset();
    });

    // 3. نموذج صرف راتب موظف
    document.getElementById('pay-salary-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const empId = parseInt(document.getElementById('pay-emp-id').value);
        const emp = state.employees.find(x => x.id === empId);
        if (!emp) return;

        const amount = parseFloat(document.getElementById('pay-amount').value) || 0;
        const period = document.getElementById('pay-period').value.trim();
        const method = document.getElementById('pay-method').value;
        const notes = document.getElementById('pay-notes').value.trim();

        const voucher = {
            id: 'SAL-' + Date.now().toString().slice(-4),
            date: new Date().toLocaleDateString('ar-SA'),
            time: new Date().toLocaleTimeString('ar-SA'),
            type: 'راتب',
            employeeId: emp.id,
            employeeName: emp.name,
            amount,
            period,
            method,
            notes
        };

        state.payroll.unshift(voucher);
        savePayroll();

        // إدراج تلقائي ضمن المصاريف
        state.expenses.unshift({
            id: 'EXP-' + Date.now().toString().slice(-4),
            date: voucher.date,
            time: voucher.time,
            category: 'رواتب وأجور',
            amount,
            method,
            payee: emp.name,
            notes: `صرف راتب ${period} للموظف ${emp.name} (${emp.role})`
        });
        saveExpenses();

        renderHR();
        renderExpenses();
        renderReports();
        closeModal('pay-salary-modal');
        showToast(`تم صرف راتب ${emp.name} بنجاح!`, 'success');
        printVoucherSlip(voucher);
    });

    // 4. نموذج تسجيل سلفة موظف
    document.getElementById('add-advance-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const empId = parseInt(document.getElementById('adv-emp-id').value);
        const emp = state.employees.find(x => x.id === empId);
        if (!emp) return;

        const amount = parseFloat(document.getElementById('adv-amount').value) || 0;
        const method = document.getElementById('adv-method').value;
        const notes = document.getElementById('adv-notes').value.trim();

        const voucher = {
            id: 'ADV-' + Date.now().toString().slice(-4),
            date: new Date().toLocaleDateString('ar-SA'),
            time: new Date().toLocaleTimeString('ar-SA'),
            type: 'سلفة / خصم',
            employeeId: emp.id,
            employeeName: emp.name,
            amount,
            method,
            notes
        };

        state.payroll.unshift(voucher);
        savePayroll();

        // إدراج في المصاريف
        state.expenses.unshift({
            id: 'EXP-' + Date.now().toString().slice(-4),
            date: voucher.date,
            time: voucher.time,
            category: 'سلف موظفين',
            amount,
            method,
            payee: emp.name,
            notes: `سلفة نقدية للموظف ${emp.name}: ${notes}`
        });
        saveExpenses();

        renderHR();
        renderExpenses();
        renderReports();
        closeModal('add-advance-modal');
        showToast(`تم تسجيل سلفة بقيمة ${amount} للموظف ${emp.name}`, 'warning');
        printVoucherSlip(voucher);
    });

    // 5. نموذج تسجيل مصروف تشغيلي جديد
    document.getElementById('add-expense-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const category = document.getElementById('exp-category').value;
        const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
        const method = document.getElementById('exp-method').value;
        const payee = document.getElementById('exp-payee').value.trim();
        const notes = document.getElementById('exp-notes').value.trim();

        const newExp = {
            id: 'EXP-' + Date.now().toString().slice(-4),
            date: new Date().toLocaleDateString('ar-SA'),
            time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
            category,
            amount,
            method,
            payee,
            notes
        };

        state.expenses.unshift(newExp);
        saveExpenses();
        renderExpenses();
        renderReports();
        closeModal('add-expense-modal');
        showToast(`تم تسجيل مصروف ${category} بقيمة ${amount} ${state.settings.currency}`, 'success');
        e.target.reset();

        // طباعة إيصال الصرف
        printVoucherSlip({
            id: newExp.id,
            date: newExp.date,
            type: 'سند صرف مصروف - ' + category,
            employeeName: payee || 'المورد',
            amount,
            method,
            notes
        });
    });

    // 6. نموذج الإعدادات العامة
    document.getElementById('settings-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        state.settings.apiUrl = document.getElementById('input-api-url').value.trim();
        state.settings.user = document.getElementById('input-username').value.trim();
        state.settings.token = document.getElementById('input-token').value.trim();
        state.settings.storeName = document.getElementById('input-store-name').value.trim();
        state.settings.phone = document.getElementById('input-store-phone').value.trim();
        state.settings.currency = document.getElementById('input-currency').value.trim() || 'ر.س';
        state.settings.taxPercent = parseFloat(document.getElementById('input-tax').value) || 0;
        state.settings.printerWidth = document.getElementById('select-printer-width').value;
        state.settings.autoPrint = document.getElementById('check-auto-print').checked;
        state.settings.soundAlert = document.getElementById('check-sound-alert').checked;
        state.settings.receiptFooter = document.getElementById('input-receipt-footer').value.trim();

        saveSettingsToStorage();
        applySettingsToDOM();
        closeModal('settings-modal');
        showToast('تم حفظ الإعدادات بنجاح!', 'success');

        syncMenuData();
        startOrderPolling();
    });

    // فلترة وبحث HR والمصاريف
    document.getElementById('hr-search-input')?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#employees-table-body tr');
        rows.forEach(r => {
            r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });

    document.getElementById('expense-search-input')?.addEventListener('input', () => {
        renderExpenses();
    });
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: ${type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : (type === 'warning' ? '#f59e0b' : '#3b82f6'))};
        color: white; padding: 10px 20px; border-radius: 8px; font-weight: bold;
        z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.15); font-size: 0.9rem;
        animation: fadeInDown 0.2s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);
}

function testSound() {
    playNotificationChime();
    showToast('تم تشغيل نغمة التنبيه التجريبية 🔔', 'info');
}

function testPrint() {
    triggerPrint({
        id: 'TEST-01',
        order_type: 'dinein',
        table_number: 'طاولة 5',
        customer_name: 'فاتورة تجريبية',
        items: [
            { name: 'وجبة زنجر المدينة', price: 250, quantity: 2 },
            { name: 'سفن اب', price: 60, quantity: 2 }
        ],
        total_price: 620,
        created_at: new Date().toLocaleTimeString('ar-SA')
    });
}

// =============================================================================
// نظام التثبيت كتطبيق مكتبي على الويندوز (Windows PWA Desktop App)
// =============================================================================
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const btn = document.getElementById('btn-install-pwa');
    if (btn) btn.style.display = 'none';
    showToast('تم تثبيت التطبيق بنجاح على جهازك!', 'success');
});

function installDesktopApp() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                showToast('جاري تثبيت التطبيق على الويندوز...', 'success');
            }
            deferredInstallPrompt = null;
        });
    } else {
        alert('💡 لتثبيت التطبيق على الويندوز:\n\n1. في متصفحك (Google Chrome أو Microsoft Edge)، اضغط على أيقونة (تثبيت التطبيق 📥) في شريط العنوان بالأعلى.\n2. أو اضغط على القائمة (⋮) ثم اختر "تطبيقات (Apps)" -> "تثبيت هذا الموقع كتطبيق".\n\nسيعمل كنافذة برنامج مستقلة على سطح المكتب وقائمة ابدأ بدون أشرطة المتصفح!');
    }
}

// =============================================================================
// مزامنة الطلبات المعلقة فور عودة الإنترنت (Auto-Sync Queue)
// =============================================================================
async function syncOfflineOrders() {
    if (!navigator.onLine || !state.offlineOrdersQueue || state.offlineOrdersQueue.length === 0) return;
    if (!state.settings.apiUrl || !state.settings.user) return;

    const queue = [...state.offlineOrdersQueue];
    const remaining = [];

    for (const ord of queue) {
        try {
            const url = new URL(state.settings.apiUrl);
            url.searchParams.set('action', 'create_order');
            const res = await fetch(url.toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ord)
            });
            const data = await res.json();
            if (!data || data.status !== 'success') {
                remaining.push(ord);
            }
        } catch (e) {
            remaining.push(ord);
        }
    }

    state.offlineOrdersQueue = remaining;
    saveOfflineQueue();
    if (queue.length > remaining.length) {
        showToast(`تمت مزامنة ${queue.length - remaining.length} طلبات معلقة مع السيرفر بنجاح!`, 'success');
    }
}

// مراقبة شبكة الإنترنت الحية
window.addEventListener('online', () => {
    updateUIConnectionStatus('syncing', 'تمت استعادة النت، جاري المزامنة...');
    syncMenuData();
    startOrderPolling();
    syncOfflineOrders();
});

window.addEventListener('offline', () => {
    updateUIConnectionStatus('offline', 'يعمل بدون إنترنت (Offline)');
    showToast('انقطع الاتصال بالإنترنت، التطبيق يعمل بكامل كفاءته بدون توقف (Offline-First)', 'warning');
});

