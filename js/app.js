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
        storeAddress: 'حلب-الصاخور-سوق الخضرامن الطرف القبلي اول شارع المكاتب من فوق',
        currency: 'ر.س',
        taxPercent: 15,
        tableServicePercent: 0,
        cardFeePercent: 0,
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
    paymentMethod: 'cash',
    selectedZone: 'all',
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
    ordersHistory: [],
    kitchenOrders: [],
    selectedKitchenStation: 'all'
};

// =============================================================================
// التهيئة الأولية للتطبيق (Initialization)
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
    loadSettingsFromStorage();
    loadERPData();
    initEventListeners();
    setOrderType(state.orderType || 'dinein');
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
    updateKitchenBadge();
    updateInstallButtonVisibility();
});

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// =============================================================================
// نظام التبديل بين الشاشات (Navigation View Switcher)
// =============================================================================
function switchView(viewName) {
    state.currentView = viewName;

    // تحديث أزرار التنقل العلوية
    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-btn-${viewName}`);
    if (activeBtn) activeBtn.classList.add('active');

    // تحديث أزرار شريط التنقل السفلي للهواتف الذكية
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.classList.remove('active'));
    const mobileBtn = document.getElementById(`mobile-nav-${viewName}`);
    if (mobileBtn) {
        mobileBtn.classList.add('active');
    } else if (['hr', 'expenses', 'reports', 'settings', 'kitchen'].includes(viewName)) {
        const moreNavBtn = document.getElementById('mobile-nav-more');
        if (moreNavBtn) moreNavBtn.classList.add('active');
    }

    // إغلاق درج سلة الموبايل وقائمة المزيد عند التنقل
    if (typeof toggleMobileCart === 'function') {
        toggleMobileCart(false);
    }
    if (typeof toggleMobileMoreMenu === 'function') {
        toggleMobileMoreMenu(false);
    }

    // إظهار الصفحة المطلوبة
    document.querySelectorAll('.view-page').forEach(page => page.classList.remove('active'));
    const targetPage = document.getElementById(`view-${viewName}`);
    if (targetPage) targetPage.classList.add('active');

    // تحديث محتوى الصفحة النشطة
    if (viewName === 'tables') renderTables();
    if (viewName === 'kitchen') renderKitchenOrders();
    if (viewName === 'hr') renderHR();
    if (viewName === 'expenses') renderExpenses();
    if (viewName === 'reports') renderReports();
    if (viewName === 'items') renderItemsManagement();
    if (viewName === 'settings') renderSettingsPage();
    if (viewName === 'pos') {
        renderCart();
    } else {
        const mobileBar = document.getElementById('mobile-cart-bar');
        if (mobileBar) mobileBar.style.display = 'none';
    }
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
            { id: 1, name: 'طاولة 1', seats: 4, zone: 'indoor', status: 'vacant', orderItems: [], orderTotal: 0, openedAt: null },
            { id: 2, name: 'طاولة 2', seats: 2, zone: 'indoor', status: 'vacant', orderItems: [], orderTotal: 0, openedAt: null },
            { id: 3, name: 'طاولة 3', seats: 6, zone: 'outdoor', status: 'occupied', orderItems: [{ name: 'زنجر المدينة', price: 200, quantity: 2 }, { name: 'سفن اب', price: 60, quantity: 2 }], orderTotal: 520, openedAt: '12:30 م' },
            { id: 4, name: 'طاولة 4', seats: 4, zone: 'outdoor', status: 'vacant', orderItems: [], orderTotal: 0, openedAt: null },
            { id: 5, name: 'طاولة 5', seats: 8, zone: 'indoor', status: 'vacant', orderItems: [], orderTotal: 0, openedAt: null },
            { id: 6, name: 'VIP 1', seats: 6, zone: 'vip', status: 'billed', orderItems: [{ name: 'وجبة زنجر المدينة', price: 300, quantity: 3 }], orderTotal: 900, openedAt: '01:15 م' }
        ];
        saveTables();
    } else {
        // التأكد من وجود خاصية zone لكل طاولة محفوظة سابقاً
        let hasZoneUpdates = false;
        state.tables.forEach(t => {
            if (!t.zone) {
                if (t.name && t.name.toLowerCase().includes('vip')) t.zone = 'vip';
                else if (t.name && (t.name.includes('خارجي') || t.name.includes('تراس'))) t.zone = 'outdoor';
                else t.zone = 'indoor';
                hasZoneUpdates = true;
            }
        });
        if (hasZoneUpdates) saveTables();
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

    // 6. سجل طلبات أقسام المطبخ (KDS)
    const savedKitchen = localStorage.getItem('codeart_pos_kitchen_orders');
    if (savedKitchen) {
        try { state.kitchenOrders = JSON.parse(savedKitchen); } catch(e) {}
    }
    if (!state.kitchenOrders) state.kitchenOrders = [];

    // 7. ذاكرة المنيو المحلي (Offline-First Menu Cache)
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

    // إذا لم تكن هناك أصناف، تحميل قائمة نموذجية افتراضية غنية
    if (!state.items || state.items.length === 0) {
        state.categories = [
            { id: 1, name: 'وجبات وساندوتشات' },
            { id: 2, name: 'بيتزا وفطائر' },
            { id: 3, name: 'مقبلات وبطاطس' },
            { id: 4, name: 'مشروبات وعصائر' }
        ];
        state.items = [
            { id: 101, name: 'وجبة زنجر المدينة سوبريم', price: 35, category_id: 1, available: true, description: 'صدر دجاج مقرمش مع جبنة شيدر وصوص خاص وخس وبطاطس', has_variations: true, variations: [{ name: 'ساندوتش فقط', price: 25 }, { name: 'وجبة كاملة مع بطاطس ومشروب', price: 35 }, { name: 'وجبة دبل ماكس', price: 42 }] },
            { id: 102, name: 'شاورما دجاج عربي', price: 28, category_id: 1, available: true, description: 'شاورما دجاج متبلة مقطعة مع بطاطس ومخلل وثومية وخبز صاج', has_variations: true, variations: [{ name: 'عربي عادي', price: 28 }, { name: 'عربي دبل', price: 38 }] },
            { id: 103, name: 'برجر لحم بلدي مشوي', price: 32, category_id: 1, available: true, description: 'برجر لحم بقري طازج مشوي على الفحم مع صوص الشيف', has_variations: false, variations: [] },
            { id: 104, name: 'بيتزا رانش دجاج إيطالية', price: 45, category_id: 2, available: true, description: 'عجينة إيطالية هشة، قطع دجاج، صوص رانش، جبنة موزاريلا', has_variations: true, variations: [{ name: 'وسط (Medium)', price: 45 }, { name: 'كبير (Large)', price: 60 }] },
            { id: 105, name: 'بيتزا مارجريتا كلاسيك', price: 38, category_id: 2, available: true, description: 'صلصة طماطم إيطالية مع ريحان طازج وجبنة موزاريلا', has_variations: true, variations: [{ name: 'وسط (Medium)', price: 38 }, { name: 'كبير (Large)', price: 50 }] },
            { id: 106, name: 'بطاطس مقلية متبلة مع جبنة', price: 15, category_id: 3, available: true, description: 'أصابع بطاطس ذهبية مع صوص الجبن والبهارات', has_variations: false, variations: [] },
            { id: 107, name: 'حلقات بصل مقرمشة (8 قطع)', price: 14, category_id: 3, available: true, description: 'حلقات بصل مقرمشة مع صوص الرانش', has_variations: false, variations: [] },
            { id: 108, name: 'عصير برتقال طازج 100%', price: 12, category_id: 4, available: true, description: 'برتقال معصور طازج بدون سكر مضاف', has_variations: false, variations: [] },
            { id: 109, name: 'مشروب غازي بارد (كانز)', price: 5, category_id: 4, available: true, description: 'بيبسي / سفن اب / ميرندا', has_variations: false, variations: [] }
        ];
        saveMenuData();
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
function saveMenuData() {
    localStorage.setItem('codeart_pos_menu_cache', JSON.stringify({
        categories: state.categories,
        items: state.items
    }));
    renderCategories();
    renderItems();
    if (state.currentView === 'items') {
        renderItemsManagement();
    }
}

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
    if (document.getElementById('input-store-address')) {
        document.getElementById('input-store-address').value = state.settings.storeAddress || '';
    }
    document.getElementById('input-currency').value = state.settings.currency || 'ر.س';
    document.getElementById('input-tax').value = state.settings.taxPercent;
    if (document.getElementById('input-table-service-percent')) {
        document.getElementById('input-table-service-percent').value = state.settings.tableServicePercent !== undefined ? state.settings.tableServicePercent : 0;
    }
    if (document.getElementById('input-card-fee-percent')) {
        document.getElementById('input-card-fee-percent').value = state.settings.cardFeePercent !== undefined ? state.settings.cardFeePercent : 0;
    }
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
            quantity: 1,
            note: ''
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
    const clearTableBtn = document.getElementById('btn-clear-active-table');
    if (clearTableBtn) clearTableBtn.style.display = 'none';
    renderCart();
}

let activeNoteCartItemId = null;

function openItemNoteModal(cartItemId) {
    activeNoteCartItemId = cartItemId;
    const item = state.cart.find(c => c.cartItemId === cartItemId);
    if (!item) return;

    const titleElem = document.getElementById('note-modal-item-name');
    if (titleElem) titleElem.textContent = item.name + (item.variation ? ` (${item.variation})` : '');
    
    const inputElem = document.getElementById('note-modal-input');
    if (inputElem) inputElem.value = item.note || '';

    openModal('item-note-modal');
    setTimeout(() => {
        if (inputElem) inputElem.focus();
    }, 150);
}

function appendQuickNote(txt) {
    const inp = document.getElementById('note-modal-input');
    if (!inp) return;
    if (!inp.value.trim()) {
        inp.value = txt;
    } else {
        inp.value = inp.value.trim() + ' + ' + txt;
    }
}

function clearNoteInput() {
    const inp = document.getElementById('note-modal-input');
    if (inp) inp.value = '';
}

function saveCartItemNote() {
    if (!activeNoteCartItemId) return;
    const item = state.cart.find(c => c.cartItemId === activeNoteCartItemId);
    const inp = document.getElementById('note-modal-input');
    if (item && inp) {
        item.note = inp.value.trim();
        if (state.activeTableId) {
            const table = state.tables.find(t => t.id === state.activeTableId);
            if (table) {
                table.orderItems = [...state.cart];
                saveTables();
            }
        }
        renderCart();
        showToast('تم حفظ ملاحظة الشيف للصنف بنجاح', 'success');
    }
    closeModal('item-note-modal');
    activeNoteCartItemId = null;
}

// تبديل وتحديد نوع الطلب (صالة / سفري / توصيل) وإخفاء/إظهار زر حفظ بالطاولة
function setOrderType(type) {
    state.orderType = type || 'dinein';

    // تحديث أزرار نوع الطلب
    document.querySelectorAll('.type-tab').forEach(tab => {
        if (tab.dataset.type === state.orderType) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    const tableWrap = document.getElementById('table-input-wrapper');
    const deliveryWrap = document.getElementById('delivery-inputs-wrapper');
    const btnSaveTable = document.getElementById('btn-save-table');

    if (state.orderType === 'dinein') {
        if (tableWrap) tableWrap.style.display = 'flex';
        if (deliveryWrap) deliveryWrap.style.display = 'none';
        if (btnSaveTable) {
            btnSaveTable.style.display = 'inline-flex';
            btnSaveTable.disabled = (state.cart.length === 0);
        }
    } else if (state.orderType === 'delivery') {
        if (tableWrap) tableWrap.style.display = 'none';
        if (deliveryWrap) deliveryWrap.style.display = 'flex';
        if (btnSaveTable) btnSaveTable.style.display = 'none';
    } else {
        // takeaway (سفري / تكاوي)
        if (tableWrap) tableWrap.style.display = 'none';
        if (deliveryWrap) deliveryWrap.style.display = 'none';
        if (btnSaveTable) btnSaveTable.style.display = 'none';
    }

    // تحديث الحسابات الخاصة بالضريبة ورسوم الصالة
    const subtotal = state.cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    updateTotals(subtotal);
}

function renderCart() {
    const container = document.getElementById('cart-items-list');
    const emptyState = document.getElementById('empty-cart-state');
    const btnCheckout = document.getElementById('btn-checkout');
    const btnSaveTable = document.getElementById('btn-save-table');
    const clearTableBtn = document.getElementById('btn-clear-active-table');

    if (clearTableBtn) {
        clearTableBtn.style.display = state.activeTableId ? 'inline-flex' : 'none';
    }

    // زر الحفظ بالطاولة يظهر فقط للطلبات داخل الصالة (طاولة) ويختفي تماماً في التكاوي والتوصيل
    if (btnSaveTable) {
        if (state.orderType === 'dinein') {
            btnSaveTable.style.display = 'inline-flex';
            btnSaveTable.disabled = (state.cart.length === 0);
        } else {
            btnSaveTable.style.display = 'none';
        }
    }

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
                <div style="flex: 1; padding-left: 6px;">
                    <div class="cart-item-title">${escapeHtml(item.name)}</div>
                    ${item.variation ? `<div class="cart-item-option-label">🔹 ${escapeHtml(item.variation)}</div>` : ''}
                    ${item.note ? `
                        <div class="cart-item-note-badge" onclick="openItemNoteModal('${item.cartItemId}')" title="اضغط لتعديل ملاحظة الشيف">
                            <i class="fas fa-comment-dots"></i> <span>ملاحظة للشيف: ${escapeHtml(item.note)}</span>
                        </div>
                    ` : ''}
                </div>
                <div style="display: flex; gap: 4px; align-items: flex-start;">
                    <button class="btn-note-item ${item.note ? 'has-note' : ''}" onclick="openItemNoteModal('${item.cartItemId}')" title="${item.note ? 'تعديل ملاحظة الشيف' : 'إضافة ملاحظة للشيف'}">
                        <i class="fas ${item.note ? 'fa-pen' : 'fa-comment-medical'}"></i>
                    </button>
                    <button class="btn-remove-item" onclick="removeCartItem('${item.cartItemId}')" title="حذف الصنف"><i class="fas fa-trash-alt"></i></button>
                </div>
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

function setPaymentMethod(method) {
    state.paymentMethod = method || 'cash';
    const btnCash = document.getElementById('pay-method-cash');
    const btnCard = document.getElementById('pay-method-card');
    if (btnCash && btnCard) {
        if (state.paymentMethod === 'cash') {
            btnCash.classList.add('active');
            btnCard.classList.remove('active');
        } else {
            btnCash.classList.remove('active');
            btnCard.classList.add('active');
        }
    }
    const subtotal = state.cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    updateTotals(subtotal);
}

function toggleMobileCart(open) {
    const cartSection = document.getElementById('pos-cart-section');
    const overlay = document.getElementById('mobile-cart-overlay');
    if (!cartSection) return;

    if (open === true) {
        cartSection.classList.add('mobile-open');
    } else if (open === false) {
        cartSection.classList.remove('mobile-open');
    } else {
        cartSection.classList.toggle('mobile-open');
    }

    if (overlay) {
        if (cartSection.classList.contains('mobile-open')) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }
}

// التحكم في إظهار وإغلاق قائمة همبرجر المنبثقة للموبايل (Mobile More Sheet Drawer)
function toggleMobileMoreMenu(open) {
    const sheet = document.getElementById('mobile-more-sheet');
    const overlay = document.getElementById('mobile-more-overlay');
    if (!sheet || !overlay) return;

    const isOpen = (open !== undefined) ? open : !sheet.classList.contains('active');
    if (isOpen) {
        sheet.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        sheet.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function updateTotals(subtotal) {
    if (subtotal === undefined) {
        subtotal = state.cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    }

    // 1. ضريبة أو خدمة الطاولة (تطبق فقط للطلبات داخل الصالة)
    const tableServicePercent = (state.orderType === 'dinein') ? Number(state.settings.tableServicePercent || 0) : 0;
    const tableServiceFee = (subtotal * tableServicePercent) / 100;

    // 2. رسوم الدفع الإلكتروني / الشبكة (تطبق فقط عند اختيار بطاقة)
    const cardFeePercent = (state.paymentMethod === 'card') ? Number(state.settings.cardFeePercent || 0) : 0;
    const cardFee = (subtotal * cardFeePercent) / 100;

    // 3. ضريبة القيمة المضافة
    const taxRate = Number(state.settings.taxPercent || 0) / 100;
    const taxableBase = subtotal + tableServiceFee + cardFee;
    const taxAmount = taxableBase * taxRate;
    const grandTotal = taxableBase + taxAmount;

    // تحديث قيم شاشة الدفع
    const subtotalEl = document.getElementById('summary-subtotal');
    if (subtotalEl) subtotalEl.textContent = `${subtotal.toFixed(2)} ${state.settings.currency}`;

    const rowTableService = document.getElementById('row-table-service');
    const cartTableService = document.getElementById('cart-table-service');
    if (rowTableService && cartTableService) {
        if (tableServiceFee > 0) {
            rowTableService.style.display = 'flex';
            cartTableService.textContent = `+${tableServiceFee.toFixed(2)} ${state.settings.currency} (${tableServicePercent}%)`;
        } else {
            rowTableService.style.display = 'none';
        }
    }

    const rowCardFee = document.getElementById('row-card-fee');
    const cartCardFee = document.getElementById('cart-card-fee');
    if (rowCardFee && cartCardFee) {
        if (cardFee > 0) {
            rowCardFee.style.display = 'flex';
            cartCardFee.textContent = `+${cardFee.toFixed(2)} ${state.settings.currency} (${cardFeePercent}%)`;
        } else {
            rowCardFee.style.display = 'none';
        }
    }

    const taxEl = document.getElementById('summary-tax');
    if (taxEl) taxEl.textContent = `${taxAmount.toFixed(2)} ${state.settings.currency}`;

    const totalEl = document.getElementById('summary-total');
    if (totalEl) totalEl.textContent = `${grandTotal.toFixed(2)} ${state.settings.currency}`;

    // تحديث شريط السلة العائم للموبايل فقط (محمي تماماً من الظهور على شاشات اللابتوب والكمبيوتر)
    const totalCount = state.cart.reduce((sum, it) => sum + it.quantity, 0);
    const mobileCartBar = document.getElementById('mobile-cart-bar');
    const mobileCartCount = document.getElementById('mobile-cart-count');
    const mobileCartTotal = document.getElementById('mobile-cart-total');

    if (mobileCartCount) mobileCartCount.textContent = `${totalCount} ${totalCount === 1 ? 'صنف' : 'أصناف'}`;
    if (mobileCartTotal) mobileCartTotal.textContent = `${grandTotal.toFixed(2)} ${state.settings.currency}`;

    if (mobileCartBar) {
        const isMobileScreen = window.innerWidth <= 768;
        if (totalCount > 0 && state.currentView === 'pos' && isMobileScreen) {
            mobileCartBar.style.display = 'flex';
        } else {
            mobileCartBar.style.display = 'none';
        }
    }
}

// حفظ طلب الطاولة جزئياً كطلب معلق بدون تأكيد أو محاسبة
function saveTableOrderPartial() {
    if (state.cart.length === 0) {
        showToast('السلة فارغة! اختر أصنافاً أولاً لحفظها داخل الطاولة', 'warning');
        return;
    }

    const tableLabel = document.getElementById('table-num-input')?.value.trim() || 'طاولة 1';
    let targetTable = null;

    if (state.activeTableId) {
        targetTable = state.tables.find(t => t.id === state.activeTableId);
    }
    if (!targetTable) {
        targetTable = state.tables.find(t => t.name.trim() === tableLabel);
    }

    if (!targetTable) {
        // إنشاء طاولة جديدة تلقائياً إذا لم تكن مسجلة مسبقاً
        targetTable = {
            id: Date.now(),
            name: tableLabel,
            seats: 4,
            status: 'occupied',
            orderItems: [],
            orderTotal: 0,
            openedAt: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
        };
        state.tables.push(targetTable);
    }

    // حفظ الأصناف والمجموع داخل الطاولة
    targetTable.status = 'occupied';
    targetTable.orderItems = JSON.parse(JSON.stringify(state.cart));
    targetTable.orderTotal = state.cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    if (!targetTable.openedAt) {
        targetTable.openedAt = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    }

    saveTables();
    renderTables();

    // إرسال الطلب المعلق للمطبخ فورياً
    addOrderToKitchen({
        id: targetTable.id,
        order_id: targetTable.name,
        table_number: targetTable.name,
        order_type: 'dinein',
        created_at: targetTable.openedAt,
        items: targetTable.orderItems
    });

    showToast(`✅ تم حفظ الطلب بنجاح في "${targetTable.name}" كطلب معلق داخل الطاولة وإرساله للمطبخ!`, 'success');

    // إفراغ السلة للشاشة لتكون جاهزة لطلب زبون آخر
    clearCart();
}

async function submitOrder() {
    if (state.cart.length === 0) return;
    const subtotal = state.cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    const tableServicePercent = (state.orderType === 'dinein') ? Number(state.settings.tableServicePercent || 0) : 0;
    const tableServiceFee = (subtotal * tableServicePercent) / 100;
    const cardFeePercent = (state.paymentMethod === 'card') ? Number(state.settings.cardFeePercent || 0) : 0;
    const cardFee = (subtotal * cardFeePercent) / 100;
    const taxRate = Number(state.settings.taxPercent || 0) / 100;
    const taxableBase = subtotal + tableServiceFee + cardFee;
    const taxAmount = taxableBase * taxRate;
    const grandTotal = taxableBase + taxAmount;

    const itemsFormatted = state.cart.map(c => ({
        id: c.itemId,
        name: c.name + (c.variation ? ` (${c.variation})` : ''),
        price: c.price,
        quantity: c.quantity,
        note: c.note || ''
    }));

    const tableLabel = document.getElementById('table-num-input').value.trim() || 'طاولة 1';
    const orderPayload = {
        username: state.settings.user,
        customer_name: state.orderType === 'delivery' ? (document.getElementById('cust-name').value || 'عميل توصيل') : 'عميل المطعم',
        customer_phone: state.orderType === 'delivery' ? (document.getElementById('cust-phone').value || '') : '',
        customer_address: state.orderType === 'delivery' ? (document.getElementById('cust-address').value || '') : '',
        table_number: state.orderType === 'dinein' ? tableLabel : '',
        order_type: state.orderType,
        payment_method: state.paymentMethod || 'cash',
        subtotal: subtotal,
        table_service_fee: tableServiceFee,
        card_fee: cardFee,
        tax_amount: taxAmount,
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
    // إرسال الطلب فورياً لشاشات أقسام المطبخ (KDS)
    addOrderToKitchen(orderPayload);
    showToast(`تم تسجيل الفاتورة #${orderId} بنجاح!`, 'success');
    clearCart();
    toggleMobileCart(false);
    renderReports();
}

// =============================================================================
// 2️⃣ إدارة الطاولات وخريطة الصالة (Floor Plan Engine)
// =============================================================================
function filterTablesByZone(zone) {
    state.selectedZone = zone || 'all';
    document.querySelectorAll('.table-zones-bar .zone-tab').forEach(tab => {
        if (tab.dataset.zone === state.selectedZone) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    renderTables();
}

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

    // تحديث أعداد الطاولات حسب المناطق
    const countAll = state.tables.length;
    const countIndoor = state.tables.filter(t => (t.zone || 'indoor') === 'indoor').length;
    const countOutdoor = state.tables.filter(t => t.zone === 'outdoor').length;
    const countVip = state.tables.filter(t => t.zone === 'vip').length;

    const elCountAll = document.getElementById('count-zone-all');
    const elCountIndoor = document.getElementById('count-zone-indoor');
    const elCountOutdoor = document.getElementById('count-zone-outdoor');
    const elCountVip = document.getElementById('count-zone-vip');
    if (elCountAll) elCountAll.textContent = countAll;
    if (elCountIndoor) elCountIndoor.textContent = countIndoor;
    if (elCountOutdoor) elCountOutdoor.textContent = countOutdoor;
    if (elCountVip) elCountVip.textContent = countVip;

    // فلترة الطاولات حسب المنطقة المختارة
    let displayedTables = state.tables;
    if (state.selectedZone && state.selectedZone !== 'all') {
        displayedTables = state.tables.filter(t => (t.zone || 'indoor') === state.selectedZone);
    }

    if (displayedTables.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #94a3b8;">
                <i class="fas fa-layer-group" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.5;"></i>
                <div style="font-weight: 700; font-size: 1.1rem; color: #64748b;">لا توجد طاولات في هذا القسم حالياً</div>
                <p style="margin-top: 6px; font-size: 0.85rem;">يمكنك إضافة طاولة جديدة وتحديد منطقتها من زر "إضافة طاولة جديدة"</p>
            </div>
        `;
        return;
    }

    displayedTables.forEach(table => {
        const card = document.createElement('div');
        const statusClass = table.status === 'vacant' ? 'vacant' : (table.status === 'occupied' ? 'occupied' : 'billed');
        const statusText = table.status === 'vacant' ? 'فارغة (متاحة)' : (table.status === 'occupied' ? 'مشغولة' : 'فاتورة مطلوبة');

        const zoneKey = table.zone || 'indoor';
        const zoneLabels = {
            'indoor': { text: 'صالة داخلية', icon: 'fa-couch' },
            'outdoor': { text: 'جلسة خارجية', icon: 'fa-sun' },
            'vip': { text: 'VIP عوائل', icon: 'fa-crown' }
        };
        const zoneInfo = zoneLabels[zoneKey] || zoneLabels['indoor'];

        let itemsSummaryHtml = '<div style="color: #94a3b8;">لا توجد طلبات جارية</div>';
        if (table.orderItems && table.orderItems.length > 0) {
            const summaryText = table.orderItems.map(it => `${escapeHtml(it.name)} (${it.quantity})${it.note ? ' [' + escapeHtml(it.note) + ']' : ''}`).join('، ');
            itemsSummaryHtml = `
                <div><i class="fas fa-utensils"></i> الأصناف: ${table.orderItems.length} صنف</div>
                <div style="font-size: 0.75rem; color: #64748b; margin-top: 3px; max-height: 40px; overflow: hidden; text-overflow: ellipsis; white-space: normal;" title="${escapeHtml(summaryText)}">
                    ${summaryText}
                </div>
            `;
        }

        card.className = `table-card ${statusClass}`;
        card.innerHTML = `
            <div class="table-card-top">
                <div class="table-number-title">
                    <i class="fas fa-chair"></i>
                    <span>${escapeHtml(table.name)}</span>
                </div>
                <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap; justify-content: flex-end;">
                    <span class="table-zone-badge ${zoneKey}"><i class="fas ${zoneInfo.icon}"></i> ${zoneInfo.text}</span>
                    <span class="table-status-pill ${statusClass}">${statusText}</span>
                </div>
            </div>
            <div class="table-card-body">
                <div><i class="fas fa-user-friends"></i> السعة: ${table.seats || 4} كراسي</div>
                ${table.openedAt ? `<div><i class="fas fa-clock"></i> جلوس منذ: ${table.openedAt}</div>` : ''}
                ${itemsSummaryHtml}
                <div class="table-order-amount">${Number(table.orderTotal || 0).toFixed(2)} ${state.settings.currency}</div>
            </div>
            <div class="table-card-actions">
                <button class="table-btn primary" onclick="openTableInPOS(${table.id})" title="${table.status === 'vacant' ? 'فتح طلب جديد' : 'تعديل طلب الطاولة'}">
                    <i class="fas fa-cart-plus"></i> ${table.status === 'vacant' ? 'طلب' : 'تعديل'}
                </button>
                ${table.status !== 'vacant' ? `
                    <button class="table-btn success" onclick="checkoutTableDirectly(${table.id})" title="محاسبة وإصدار الفاتورة">
                        <i class="fas fa-cash-register"></i> محاسبة
                    </button>
                    <button class="table-btn warning" onclick="clearTableWithoutCheckout(${table.id})" title="تفريغ الطاولة بدون محاسبة">
                        <i class="fas fa-undo"></i> تفريغ
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
    setOrderType('dinein');
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

function clearTableWithoutCheckout(tableId) {
    const table = state.tables.find(t => t.id === tableId);
    if (!table) return;

    if (!confirm(`هل أنت متأكد من تفريغ وإخلاء "${table.name}" وإلغاء الطلب دون محاسبة أو تسجيل مبيعات؟`)) {
        return;
    }

    table.status = 'vacant';
    table.orderItems = [];
    table.orderTotal = 0;
    table.openedAt = null;

    if (state.activeTableId === tableId) {
        state.cart = [];
        state.activeTableId = null;
        renderCart();
    }

    saveTables();
    renderTables();
    showToast(`تم تفريغ وإخلاء ${table.name} بنجاح بدون محاسبة`, 'info');
}

function clearActiveTableWithoutCheckout() {
    if (!state.activeTableId) return;
    clearTableWithoutCheckout(state.activeTableId);
}

function deleteTable(tableId) {
    if (!confirm('هل تريد حذف هذه الطاولة بالتأكيد؟')) return;
    state.tables = state.tables.filter(t => t.id !== tableId);
    saveTables();
    renderTables();
    showToast('تم حذف الطاولة', 'info');
}

// =============================================================================
// 🍳 نظام شاشات أقسام المطبخ وتجهيز الطلبات (Kitchen Display System - KDS)
// =============================================================================
const KITCHEN_DEPARTMENTS = {
    all: { name: 'كل الأقسام', icon: 'fa-th-large', color: '#64748b' },
    pizza: { name: 'قسم البيتزا والفطائر', icon: 'fa-pizza-slice', color: '#ea580c' },
    grill: { name: 'قسم الشاورما والمشاوي', icon: 'fa-drumstick-bite', color: '#b91c1c' },
    burger: { name: 'قسم البرجر والمقالي', icon: 'fa-hamburger', color: '#d97706' },
    beverages: { name: 'قسم المشروبات والبار', icon: 'fa-glass-whiskey', color: '#0284c7' },
    desserts: { name: 'قسم الحلويات', icon: 'fa-ice-cream', color: '#8b5cf6' },
    main: { name: 'المطبخ العام / الوجبات', icon: 'fa-utensils', color: '#10b981' }
};

function getItemDepartment(item) {
    if (!item) return 'main';
    if (item.department) return item.department;

    const text = ((item.name || '') + ' ' + (item.category_name || '') + ' ' + (item.category || '')).toLowerCase();

    if (text.includes('بيتزا') || text.includes('pizza') || text.includes('فطائر') || text.includes('فطيرة') || text.includes('مناقيش') || text.includes('صفيحة') || text.includes('كالزوني')) {
        return 'pizza';
    }
    if (text.includes('شاورما') || text.includes('مشاوي') || text.includes('كباب') || text.includes('شيش') || text.includes('كفتة') || text.includes('توشكا') || text.includes('ماريا') || text.includes('عرائس') || text.includes('لحم') || text.includes('شقف')) {
        return 'grill';
    }
    if (text.includes('برجر') || text.includes('burger') || text.includes('زنجر') || text.includes('كرسبي') || text.includes('فاهيتا') || text.includes('ساندوتش') || text.includes('ساندويش') || text.includes('بطاطس') || text.includes('ناجتس') || text.includes('ستربس')) {
        return 'burger';
    }
    if (text.includes('عصير') || text.includes('مشروب') || text.includes('بيبسي') || text.includes('كولا') || text.includes('سفن') || text.includes('مياه') || text.includes('ماء') || text.includes('قهوة') || text.includes('شاي') || text.includes('موهيتو') || text.includes('كوكتيل') || text.includes('سموذي') || text.includes('ميلك شيك')) {
        return 'beverages';
    }
    if (text.includes('حلو') || text.includes('كيك') || text.includes('ايس كريم') || text.includes('وافل') || text.includes('كريب') || text.includes('كنافة') || text.includes('بسبوسة') || text.includes('تشيز كيك')) {
        return 'desserts';
    }
    return 'main';
}

function saveKitchenOrders() {
    localStorage.setItem('codeart_pos_kitchen_orders', JSON.stringify(state.kitchenOrders || []));
    updateKitchenBadge();
}

function updateKitchenBadge() {
    const badge = document.getElementById('kitchen-pending-badge');
    if (!badge) return;
    const pendingCount = (state.kitchenOrders || []).filter(o => o.status !== 'ready').length;
    if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

function addOrderToKitchen(order) {
    if (!state.kitchenOrders) state.kitchenOrders = [];

    const orderNum = order.order_id || order.id || Math.floor(100 + Math.random() * 900);
    const existingIndex = state.kitchenOrders.findIndex(o => String(o.id) === String(order.id) || String(o.orderNumber) === String(orderNum));

    const itemsRaw = order.items || state.cart || [];
    const kitchenItems = itemsRaw.map((it, idx) => ({
        id: it.id || idx,
        name: it.name || 'صنف',
        price: it.price || 0,
        quantity: it.quantity || 1,
        note: it.note || '',
        variation: it.variation || '',
        department: it.department || getItemDepartment(it),
        ready: false
    }));

    const kdsOrder = {
        id: order.id || Date.now(),
        orderNumber: orderNum,
        table: order.table_number || order.table || (state.orderType === 'dinein' ? (document.getElementById('table-num-input')?.value || 'طاولة 1') : ''),
        orderType: order.order_type || state.orderType || 'dinein',
        customerName: order.customer_name || state.customerName || '',
        customerPhone: order.customer_phone || state.customerPhone || '',
        openedAt: order.created_at || new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        items: kitchenItems,
        status: 'pending'
    };

    if (existingIndex >= 0) {
        state.kitchenOrders[existingIndex] = kdsOrder;
    } else {
        state.kitchenOrders.unshift(kdsOrder);
    }

    saveKitchenOrders();
    if (state.settings.soundAlert) {
        try { testSound(); } catch(e) {}
    }
    if (state.currentView === 'kitchen') {
        renderKitchenOrders();
    }
}

function filterKitchenStation(stationKey) {
    state.selectedKitchenStation = stationKey || 'all';
    document.querySelectorAll('.kds-stations-bar .kds-station-tab').forEach(tab => {
        if (tab.dataset.station === state.selectedKitchenStation) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    renderKitchenOrders();
}

function renderKitchenOrders() {
    const container = document.getElementById('kds-orders-container');
    const emptyState = document.getElementById('empty-kds-state');
    if (!container) return;

    const currentStation = state.selectedKitchenStation || 'all';

    // تحديث عدادات الأقسام في التبويبات
    const counts = { all: 0, pizza: 0, grill: 0, burger: 0, beverages: 0, main: 0 };
    (state.kitchenOrders || []).forEach(ord => {
        if (ord.status !== 'ready') {
            counts.all++;
            const deptsInOrder = new Set(ord.items.map(it => it.department));
            deptsInOrder.forEach(dept => {
                if (counts[dept] !== undefined) counts[dept]++;
            });
        }
    });

    Object.keys(counts).forEach(k => {
        const badge = document.getElementById(`count-station-${k}`);
        if (badge) badge.textContent = counts[k];
    });

    // تصفية الطلبات بحسب القسم المختار
    const filteredOrders = (state.kitchenOrders || []).filter(ord => {
        if (ord.status === 'ready') return false;
        if (currentStation === 'all') return true;
        return ord.items.some(it => it.department === currentStation);
    });

    if (filteredOrders.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    container.innerHTML = '';

    filteredOrders.forEach(ord => {
        const displayedItems = currentStation === 'all'
            ? ord.items
            : ord.items.filter(it => it.department === currentStation);

        if (displayedItems.length === 0) return;

        const minutesElapsed = Math.floor((Date.now() - (ord.timestamp || Date.now())) / 60000);
        const isUrgent = minutesElapsed >= 15;
        const allDeptItemsReady = displayedItems.every(it => it.ready);

        const card = document.createElement('div');
        card.className = `kds-card ${isUrgent ? 'urgent' : ''} ${allDeptItemsReady ? 'completed' : ''}`;

        const typeLabels = {
            dinein: { text: `طاولة: ${ord.table || '1'}`, cls: 'dinein' },
            takeaway: { text: 'سفري (تيك أواي)', cls: 'takeaway' },
            delivery: { text: `توصيل: ${ord.customerName || 'عميل'}`, cls: 'delivery' }
        };
        const typeInfo = typeLabels[ord.orderType] || typeLabels.dinein;

        let itemsHtml = '';
        displayedItems.forEach(it => {
            const deptObj = KITCHEN_DEPARTMENTS[it.department] || KITCHEN_DEPARTMENTS.main;
            itemsHtml += `
                <div class="kds-item-row" style="${it.ready ? 'opacity: 0.5; text-decoration: line-through;' : ''}">
                    <div class="kds-item-main">
                        <div class="kds-item-qty-name">
                            <span class="kds-qty-badge">${it.quantity}x</span>
                            <span>${escapeHtml(it.name)} ${it.variation ? `<small style="color: #64748b;">(${escapeHtml(it.variation)})</small>` : ''}</span>
                        </div>
                        ${currentStation === 'all' ? `<span class="kds-item-station-tag">${deptObj.name}</span>` : ''}
                    </div>
                    ${it.note ? `<div class="kds-item-note"><i class="fas fa-comment-dots"></i> ملاحظة الشيف: ${escapeHtml(it.note)}</div>` : ''}
                </div>
            `;
        });

        card.innerHTML = `
            <div class="kds-card-header">
                <div class="kds-order-info">
                    <span class="kds-order-num">#${ord.orderNumber}</span>
                    <span class="kds-order-type-badge ${typeInfo.cls}">${typeInfo.text}</span>
                </div>
                <div class="kds-card-timer ${isUrgent ? 'urgent' : ''}">
                    <i class="fas fa-stopwatch"></i>
                    <span>منذ ${minutesElapsed} د</span>
                </div>
            </div>
            <div class="kds-card-items">
                ${itemsHtml}
            </div>
            <div class="kds-card-footer">
                <button type="button" class="btn-kds-ready" onclick="markKitchenOrderDepartmentReady('${ord.id}', '${currentStation}')" style="${allDeptItemsReady ? 'background: #64748b;' : ''}">
                    <i class="fas ${allDeptItemsReady ? 'fa-check-double' : 'fa-check'}"></i>
                    <span>${allDeptItemsReady ? 'تم التجهيز مسبقاً' : (currentStation === 'all' ? 'تجهيز كل الطلب ✅' : 'تم تجهيز القسم ✅')}</span>
                </button>
                <button type="button" class="btn-kds-print" onclick="printDepartmentKitchenSlip('${ord.id}', '${currentStation}')" title="طباعة بون المطبخ لهذا القسم">
                    <i class="fas fa-print"></i>
                    <span>بون</span>
                </button>
            </div>
        `;

        container.appendChild(card);
    });

    updateKitchenBadge();
}

function markKitchenOrderDepartmentReady(orderId, departmentKey) {
    const order = (state.kitchenOrders || []).find(o => String(o.id) === String(orderId));
    if (!order) return;

    if (departmentKey === 'all') {
        order.items.forEach(it => it.ready = true);
        order.status = 'ready';
    } else {
        order.items.forEach(it => {
            if (it.department === departmentKey) {
                it.ready = true;
            }
        });
        if (order.items.every(it => it.ready)) {
            order.status = 'ready';
        }
    }

    saveKitchenOrders();
    const deptTitle = KITCHEN_DEPARTMENTS[departmentKey]?.name || 'الطلب';
    showToast(`تم وضع ${deptTitle} للطلب #${order.orderNumber} كجاهز!`, 'success');
    renderKitchenOrders();
}

function clearCompletedKitchenOrders() {
    state.kitchenOrders = (state.kitchenOrders || []).filter(o => o.status !== 'ready');
    saveKitchenOrders();
    showToast('تم مسح الطلبات المكتملة من شاشة المطبخ', 'info');
    renderKitchenOrders();
}

function printDepartmentKitchenSlip(orderId, departmentKey) {
    const order = (state.kitchenOrders || []).find(o => String(o.id) === String(orderId));
    if (!order) return;

    const currentStation = departmentKey || 'all';
    const deptObj = KITCHEN_DEPARTMENTS[currentStation] || KITCHEN_DEPARTMENTS.main;
    const items = currentStation === 'all' ? order.items : order.items.filter(it => it.department === currentStation);

    if (items.length === 0) {
        showToast('لا توجد أصناف تابعة لهذا القسم في هذا الطلب', 'warning');
        return;
    }

    const printArea = document.getElementById('receipt-print-area');
    if (!printArea) return;

    let itemsRowsHtml = '';
    items.forEach(it => {
        itemsRowsHtml += `
            <div style="border-bottom: 1px dashed #000; padding: 4px 0; margin-bottom: 4px;">
                <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 900;">
                    <span>[${it.quantity}x] ${escapeHtml(it.name)}</span>
                </div>
                ${it.variation ? `<div style="font-size: 12px; font-weight: bold; color: #333;">(الحجم/النوع: ${escapeHtml(it.variation)})</div>` : ''}
                ${it.note ? `<div style="font-size: 13px; font-weight: bold; background: #eee; padding: 2px 4px; margin-top: 2px; border: 1px solid #000;">* ملاحظة: ${escapeHtml(it.note)}</div>` : ''}
            </div>
        `;
    });

    const is58mm = state.settings.printerWidth === '58mm';
    const paperClass = is58mm ? 'receipt-58mm' : '';

    const slipHtml = `
        <div class="receipt-container ${paperClass}" style="font-family: 'Tajawal', sans-serif; color: #000; padding: 2mm;">
            <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px;">
                <div style="font-size: 18px; font-weight: 900;">بون تحضير المطبخ 🍳</div>
                <div style="display: inline-block; border: 2px solid #000; font-size: 14px; font-weight: 900; padding: 2px 8px; margin-top: 3px;">
                    ${deptObj.name}
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; margin-bottom: 4px;">
                <span>طلب رقم: #${order.orderNumber}</span>
                <span>${order.table ? `طاولة: ${order.table}` : (order.orderType === 'takeaway' ? 'سفري' : 'توصيل')}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px; border-bottom: 1px solid #000; padding-bottom: 4px;">
                <span>الوقت: ${order.openedAt}</span>
                <span>التاريخ: ${new Date().toLocaleDateString('ar-SA')}</span>
            </div>
            <div style="margin-bottom: 8px;">
                ${itemsRowsHtml}
            </div>
            <div style="text-align: center; border-top: 1px dashed #000; padding-top: 4px; font-size: 11px; font-weight: bold;">
                إجمالي أصناف القسم: ${items.reduce((s, it) => s + it.quantity, 0)}
            </div>
        </div>
    `;

    printArea.innerHTML = slipHtml;
    setTimeout(() => {
        window.print();
    }, 100);
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
            quantity: Number(item.quantity || item.qty || 1),
            note: item.note || item.notes || ''
        }));
    }
    if (typeof rawItems === 'object') {
        return Object.entries(rawItems).map(([key, val]) => {
            if (val && typeof val === 'object') {
                return {
                    name: val.name || key,
                    price: Number(val.price || 0),
                    quantity: Number(val.qty || val.quantity || 1),
                    note: val.note || val.notes || ''
                };
            }
            return { name: key, price: 0, quantity: 1, note: '' };
        });
    }
    return [];
}

function triggerPrint(order) {
    const container = document.getElementById('receipt-print-area');
    if (!container) return;

    let typeTitle = 'طلب صالة';
    if (order.order_type === 'takeaway') typeTitle = 'تيك أواي';
    if (order.order_type === 'delivery') typeTitle = 'توصيل';

    const itemsList = normalizeOrderItems(order.items);
    let itemsRows = '';
    let subtotalCalc = 0;

    itemsList.forEach(item => {
        const qty = item.quantity || 1;
        const p = Number(item.price || 0);
        const lineTotal = p * qty;
        subtotalCalc += lineTotal;

        itemsRows += `
            <tr>
                <td>
                    ${escapeHtml(item.name)}
                    ${item.note ? `<div class="note">ملاحظة: ${escapeHtml(item.note)}</div>` : ''}
                </td>
                <td>${qty}</td>
                <td>${p.toFixed(1)}</td>
                <td style="text-align: left;">${lineTotal.toFixed(1)}</td>
            </tr>
        `;
    });

    const tableServiceFee = Number(order.table_service_fee || 0);
    const cardFee = Number(order.card_fee || 0);
    const taxRate = Number(state.settings.taxPercent || 0);
    const taxableBase = subtotalCalc + tableServiceFee + cardFee;
    const taxAmount = Number(order.tax_amount !== undefined ? order.tax_amount : (taxableBase * taxRate) / 100);
    const grandTotal = Number(order.total_price || (taxableBase + taxAmount));
    const payMethod = order.payment_method || 'cash';

    const storeTitle = state.settings.storeName || 'مطعمي';
    const storeAddress = state.settings.storeAddress || 'حلب-الصاخور-سوق الخضرامن الطرف القبلي اول شارع المكاتب من فوق';
    const storePhone = state.settings.phone || '01125611779';
    const footerMsg = state.settings.receiptFooter || 'شكراً لزيارتكم!';
    const orderDate = order.created_at || new Date().toLocaleString('ar-SA');

    const qrBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGMAAABjAQAAAACnQIM4AAABmklEQVR4nIVUPW/bMBB9FAOwS8RmNEBDAbpl6UoDBuSx/6YRumipbKFLJ7u/oL+FXUpv+QUF6CpFulVKFhZQfIW6JAGM44HL4R7efTzeAVCjdkbHEUCG55a98FCQD1XshmjWxCKzxwxye4MvewyveCSA2brGeX069mSTd/fBLYU7HXuyTB5xCfz4qaAj3xGgTOWnl+Ikiv41vF5JosBPaauQw+Sl3CWQIbddS6byyTpl6yFIblUQnkWezXrbfd3jIc7f1zznKLzRkYjGxvJ1GkHd0cojTOX4Kd3m3xbZTXiItzlYzjMa3iG/epxfmXv7m0XOf32fvfWHe3UiH15m/1gvsV82f+/mq4SaF5+7qg5iNxt2l/wPaawcCNcWOqGmyVWoCNp1lFCz29hRRAiPxiZ0J1f0oF6FXPHIoClob5qSNmVii1tv1hEoISLfEREVrR+FK/oEJ6BoR8WxNNe87llBTvxZ4ZOTLX9DYIQf/98cgJ/S5L1pY2irVPaJs9uURI4Gfo+mvF0/qV8k9j07iNXiggzUoVqwnP8ANUK2RTcrEUwAAAAASUVORK5CYII=";

    container.innerHTML = `
        <div class="receipt">
            <div class="header">
                <h2>${escapeHtml(storeTitle)}</h2>
                ${storeAddress ? `<p>${escapeHtml(storeAddress)}</p>` : ''}
                <p>هاتف: ${escapeHtml(storePhone)}</p>
            </div>
            
            <div class="order-info">
                <span>طلب: #${order.id}</span>
                <span>${typeTitle}</span>
            </div>
            <div style="text-align: center; font-size: 11px; margin-bottom: 10px;">${orderDate}</div>
            
            ${(order.table_number || order.customer_name || order.customer_phone || order.customer_address) ? `
            <div class="customer-box">
                ${order.table_number ? `<p><strong>الطاولة:</strong> ${escapeHtml(order.table_number)}</p>` : ''}
                ${order.customer_name ? `<p><strong>العميل:</strong> ${escapeHtml(order.customer_name)}</p>` : ''}
                ${order.customer_phone ? `<p><strong>الهاتف:</strong> ${escapeHtml(order.customer_phone)}</p>` : ''}
                ${order.customer_address ? `<p><strong>العنوان:</strong> ${escapeHtml(order.customer_address)}</p>` : ''}
            </div>
            ` : ''}
            
            <table class="table">
                <thead>
                    <tr>
                        <th>الصنف</th>
                        <th>كمية</th>
                        <th>سعر</th>
                        <th style="text-align: left;">إجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>
            
            <div class="totals-box">
                <div class="total-row"><span>الإجمالي الفرعي:</span><span>${subtotalCalc.toFixed(2)}</span></div>
                ${tableServiceFee > 0 ? `
                <div class="total-row"><span>خدمة الطاولة (${state.settings.tableServicePercent || 0}%):</span><span>+${tableServiceFee.toFixed(2)}</span></div>
                ` : ''}
                ${cardFee > 0 ? `
                <div class="total-row"><span>رسوم الدفع بالبطاقة (${state.settings.cardFeePercent || 0}%):</span><span>+${cardFee.toFixed(2)}</span></div>
                ` : ''}
                ${taxAmount > 0 ? `<div class="total-row"><span>ضريبة مضافة (${taxRate}%):</span><span>${taxAmount.toFixed(2)}</span></div>` : ''}
                
                <div class="grand-total">
                    <span>الصافي (${state.settings.currency}):</span>
                    <span>${grandTotal.toFixed(2)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 6px; color: #475569; border-top: 1px dashed #cbd5e1; padding-top: 4px;">
                    <span>طريقة الدفع:</span>
                    <span><strong>${payMethod === 'card' ? '💳 شبكة / بطاقة' : '💵 نقداً (كاش)'}</strong></span>
                </div>
            </div>
            
            <div class="qr-box">
                <p>امسح الكود لعرض المنيو</p>
                <img src="${qrBase64}" alt="QR Code" width="100"/>
            </div>
            
            <div class="footer">${escapeHtml(footerMsg)}</div>
            <div class="credits">CodeArt POS System<br>Developed by Ahmed Abdelwahab</div>
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

    // تبديل نوع الطلب في شاشة POS (صالة / سفري / توصيل)
    document.querySelectorAll('.type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            setOrderType(tab.dataset.type);
        });
    });

    // 1. نموذج إضافة طاولة جديدة
    document.getElementById('add-table-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('input-new-table-name').value.trim();
        const seats = parseInt(document.getElementById('input-new-table-seats').value) || 4;
        const zone = document.getElementById('input-new-table-zone')?.value || 'indoor';
        const notes = document.getElementById('input-new-table-notes').value.trim();

        const newTable = {
            id: Date.now(),
            name,
            seats,
            zone,
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
        state.settings.storeAddress = document.getElementById('input-store-address')?.value.trim() || '';
        state.settings.currency = document.getElementById('input-currency').value.trim() || 'ر.س';
        state.settings.taxPercent = parseFloat(document.getElementById('input-tax').value) || 0;
        state.settings.tableServicePercent = parseFloat(document.getElementById('input-table-service-percent')?.value) || 0;
        state.settings.cardFeePercent = parseFloat(document.getElementById('input-card-fee-percent')?.value) || 0;
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

    // 7. نموذج إضافة / تعديل صنف في المنيو
    document.getElementById('item-edit-form')?.addEventListener('submit', saveItemFromModal);

    // فلترة وبحث الأصناف
    document.getElementById('items-search-input')?.addEventListener('input', () => {
        filterItemsTable();
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
// 6️⃣ إدارة قائمة الطعام والأصناف (Items & Menu Management Engine)
// =============================================================================
function renderItemsManagement() {
    const total = state.items.length;
    const available = state.items.filter(it => it.available !== false && it.available !== 0 && it.available !== '0').length;
    const unavailable = total - available;
    const categoriesCount = state.categories.length;

    if (document.getElementById('kpi-items-total')) document.getElementById('kpi-items-total').textContent = total;
    if (document.getElementById('kpi-items-available')) document.getElementById('kpi-items-available').textContent = available;
    if (document.getElementById('kpi-items-unavailable')) document.getElementById('kpi-items-unavailable').textContent = unavailable;
    if (document.getElementById('kpi-categories-total')) document.getElementById('kpi-categories-total').textContent = categoriesCount;

    // تحديث قائمة الفلترة للتصنيفات
    const catFilter = document.getElementById('items-category-filter');
    if (catFilter) {
        const currentSelected = catFilter.value;
        catFilter.innerHTML = '<option value="all">جميع التصنيفات</option>';
        state.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.name;
            catFilter.appendChild(opt);
        });
        catFilter.value = currentSelected || 'all';
    }

    // تحديث datalist للتصنيفات في نموذج الإضافة
    const datalist = document.getElementById('categories-datalist');
    if (datalist) {
        datalist.innerHTML = '';
        state.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.name;
            datalist.appendChild(opt);
        });
    }

    filterItemsTable();
}

function filterItemsTable() {
    const tbody = document.getElementById('menu-items-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const searchQuery = (document.getElementById('items-search-input')?.value || '').toLowerCase().trim();
    const catFilter = document.getElementById('items-category-filter')?.value || 'all';
    const statusFilter = document.getElementById('items-status-filter')?.value || 'all';

    let list = state.items.filter(it => {
        // فلتر البحث
        if (searchQuery) {
            const matchName = it.name && it.name.toLowerCase().includes(searchQuery);
            const matchEn = it.name_en && it.name_en.toLowerCase().includes(searchQuery);
            const matchPrice = String(it.price).includes(searchQuery);
            if (!matchName && !matchEn && !matchPrice) return false;
        }
        // فلتر التصنيف
        if (catFilter !== 'all') {
            if (String(it.category_id) !== String(catFilter)) return false;
        }
        // فلتر الحالة
        const isAvail = it.available !== false && it.available !== 0 && it.available !== '0';
        if (statusFilter === 'available' && !isAvail) return false;
        if (statusFilter === 'unavailable' && isAvail) return false;

        return true;
    });

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 25px;">لا توجد أصناف مطابقة للبحث</td></tr>`;
        return;
    }

    list.forEach(item => {
        const tr = document.createElement('tr');
        const isAvail = item.available !== false && item.available !== 0 && item.available !== '0';
        const cat = state.categories.find(c => String(c.id) === String(item.category_id));
        const catName = cat ? cat.name : (item.category_name || 'عام');

        let variationsSummary = '<span style="color: #94a3b8;">—</span>';
        if (item.has_variations && item.variations && item.variations.length > 0) {
            variationsSummary = item.variations.map(v => `${escapeHtml(v.name || v.title)} (${Number(v.price).toFixed(2)})`).join('، ');
        }

        const thumbHtml = item.image_url && item.image_url.trim() !== ''
            ? `<img src="${item.image_url}" alt="${escapeHtml(item.name)}" class="item-table-thumb" onerror="this.outerHTML='<div class=\\'item-table-thumb fallback\\'><i class=\\'fas fa-utensils\\'></i></div>'">`
            : `<div class="item-table-thumb fallback"><i class="fas fa-utensils"></i></div>`;

        tr.innerHTML = `
            <td>${thumbHtml}</td>
            <td>
                <strong>${escapeHtml(item.name)}</strong>
                ${item.description ? `<div style="font-size: 0.75rem; color: #64748b; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</div>` : ''}
            </td>
            <td><span class="badge" style="background: #e0e7ff; color: #4338ca; padding: 3px 8px; border-radius: 6px; font-size: 0.78rem;">${escapeHtml(catName)}</span></td>
            <td><strong>${Number(item.price).toFixed(2)} ${state.settings.currency}</strong></td>
            <td style="font-size: 0.8rem; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(variationsSummary)}">${variationsSummary}</td>
            <td>
                <span class="status-badge ${isAvail ? 'available' : 'unavailable'}" style="cursor: pointer;" onclick="toggleItemAvailability('${item.id}')" title="اضغط لتبديل حالة التوفر">
                    <i class="fas ${isAvail ? 'fa-check' : 'fa-ban'}"></i> ${isAvail ? 'متاح' : 'نافد'}
                </span>
            </td>
            <td>
                <div style="display: flex; gap: 4px;">
                    <button class="action-btn" onclick="openEditItemModal('${item.id}')" title="تعديل الصنف"><i class="fas fa-pen"></i></button>
                    <button class="action-btn danger" onclick="deleteItem('${item.id}')" title="حذف الصنف"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openAddItemModal() {
    document.getElementById('item-edit-id').value = '';
    document.getElementById('item-edit-name').value = '';
    document.getElementById('item-edit-price').value = '';
    document.getElementById('item-edit-category').value = '';
    document.getElementById('item-edit-available').value = '1';
    document.getElementById('item-edit-desc').value = '';
    document.getElementById('item-edit-image').value = '';
    document.getElementById('item-edit-modal-title').innerHTML = '<i class="fas fa-plus-circle" style="color: var(--primary);"></i> إضافة صنف جديد للمنيو';
    document.getElementById('item-edit-variations-container').innerHTML = '';
    openModal('item-edit-modal');
}

function openEditItemModal(itemId) {
    const item = state.items.find(i => String(i.id) === String(itemId));
    if (!item) return;

    document.getElementById('item-edit-id').value = item.id;
    document.getElementById('item-edit-name').value = item.name || '';
    document.getElementById('item-edit-price').value = item.price || 0;
    
    const cat = state.categories.find(c => String(c.id) === String(item.category_id));
    document.getElementById('item-edit-category').value = cat ? cat.name : (item.category_name || '');

    const isAvail = item.available !== false && item.available !== 0 && item.available !== '0';
    document.getElementById('item-edit-available').value = isAvail ? '1' : '0';
    document.getElementById('item-edit-desc').value = item.description || '';
    document.getElementById('item-edit-image').value = item.image_url || '';

    document.getElementById('item-edit-modal-title').innerHTML = `<i class="fas fa-pen" style="color: var(--primary);"></i> تعديل: ${escapeHtml(item.name)}`;

    const container = document.getElementById('item-edit-variations-container');
    container.innerHTML = '';
    if (item.has_variations && Array.isArray(item.variations)) {
        item.variations.forEach(v => {
            addVariationRow(v.name || v.title, v.price);
        });
    }

    openModal('item-edit-modal');
}

function addVariationRow(name = '', price = '') {
    const container = document.getElementById('item-edit-variations-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'variation-input-row';
    row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 6px;';
    row.innerHTML = `
        <input type="text" class="form-control var-name" placeholder="اسم الحجم / الخيار (مثال: عائلي، وسط، كومبو)" value="${escapeHtml(name)}" style="flex: 2; font-size: 0.85rem;" required>
        <input type="number" class="form-control var-price" placeholder="السعر" step="0.5" min="0" value="${price !== '' ? price : ''}" style="flex: 1; font-size: 0.85rem;" required>
        <button type="button" class="btn-remove-item" onclick="this.parentElement.remove()" title="حذف الخيار"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
}

function saveItemFromModal(e) {
    if (e) e.preventDefault();
    const itemId = document.getElementById('item-edit-id').value;
    const name = document.getElementById('item-edit-name').value.trim();
    const price = parseFloat(document.getElementById('item-edit-price').value) || 0;
    const categoryName = document.getElementById('item-edit-category').value.trim();
    const available = document.getElementById('item-edit-available').value === '1';
    const description = document.getElementById('item-edit-desc').value.trim();
    const image_url = document.getElementById('item-edit-image').value.trim();

    if (!name || isNaN(price)) {
        showToast('يرجى كتابة اسم الصنف والسعر الأساسي', 'warning');
        return;
    }

    // إيجاد أو إنشاء التصنيف
    let category = state.categories.find(c => c.name.trim().toLowerCase() === categoryName.toLowerCase());
    if (!category && categoryName) {
        category = {
            id: 'cat_' + Date.now(),
            name: categoryName
        };
        state.categories.push(category);
    }
    const category_id = category ? category.id : 1;

    // استخراج الخيارات والأحجام
    const varRows = document.querySelectorAll('#item-edit-variations-container .variation-input-row');
    const variations = [];
    varRows.forEach(row => {
        const vName = row.querySelector('.var-name')?.value.trim();
        const vPrice = parseFloat(row.querySelector('.var-price')?.value);
        if (vName && !isNaN(vPrice)) {
            variations.push({ name: vName, price: vPrice });
        }
    });

    if (itemId) {
        // تعديل صنف قائم
        const item = state.items.find(i => String(i.id) === String(itemId));
        if (item) {
            item.name = name;
            item.price = price;
            item.category_id = category_id;
            item.category_name = category ? category.name : categoryName;
            item.available = available;
            item.description = description;
            item.image_url = image_url;
            item.has_variations = variations.length > 0;
            item.variations = variations;
            showToast(`تم تحديث بيانات "${name}" بنجاح!`, 'success');
        }
    } else {
        // إضافة صنف جديد
        const newItem = {
            id: 'it_' + Date.now(),
            name,
            price,
            category_id,
            category_name: category ? category.name : categoryName,
            available,
            description,
            image_url,
            has_variations: variations.length > 0,
            variations
        };
        state.items.unshift(newItem);
        showToast(`تمت إضافة الصنف الجديد "${name}" إلى المنيو بنجاح!`, 'success');
    }

    saveMenuData();
    closeModal('item-edit-modal');
}

function deleteItem(itemId) {
    const item = state.items.find(i => String(i.id) === String(itemId));
    if (!item) return;

    if (!confirm(`هل أنت متأكد من حذف صنف "${item.name}" نهائياً من المنيو؟`)) {
        return;
    }

    state.items = state.items.filter(i => String(i.id) !== String(itemId));
    saveMenuData();
    showToast(`تم حذف الصنف "${item.name}" بنجاح`, 'info');
}

function toggleItemAvailability(itemId) {
    const item = state.items.find(i => String(i.id) === String(itemId));
    if (!item) return;

    const currentStatus = item.available !== false && item.available !== 0 && item.available !== '0';
    item.available = !currentStatus;
    saveMenuData();
    showToast(`صنف "${item.name}" أصبح الآن: ${item.available ? 'متاح للطلب ✅' : 'نافد / موقوف ❌'}`, 'info');
}

// =============================================================================
// 7️⃣ إدارة صفحة الإعدادات الشاملة (Full Settings Page Engine)
// =============================================================================
function renderSettingsPage() {
    const s = state.settings;
    if (document.getElementById('setting-store-name')) document.getElementById('setting-store-name').value = s.storeName || '';
    if (document.getElementById('setting-store-phone')) document.getElementById('setting-store-phone').value = s.phone || '';
    if (document.getElementById('setting-currency')) document.getElementById('setting-currency').value = s.currency || 'ر.س';
    if (document.getElementById('setting-store-address')) document.getElementById('setting-store-address').value = s.storeAddress || '';
    if (document.getElementById('setting-tax-percent')) document.getElementById('setting-tax-percent').value = s.taxPercent !== undefined ? s.taxPercent : 15;
    if (document.getElementById('setting-table-service-percent')) document.getElementById('setting-table-service-percent').value = s.tableServicePercent !== undefined ? s.tableServicePercent : 0;
    if (document.getElementById('setting-card-fee-percent')) document.getElementById('setting-card-fee-percent').value = s.cardFeePercent !== undefined ? s.cardFeePercent : 0;
    if (document.getElementById('setting-printer-width')) document.getElementById('setting-printer-width').value = s.printerWidth || '80mm';
    if (document.getElementById('setting-receipt-footer')) document.getElementById('setting-receipt-footer').value = s.receiptFooter || '';
    if (document.getElementById('setting-auto-print')) document.getElementById('setting-auto-print').checked = s.autoPrint !== false;
    if (document.getElementById('setting-sound-alert')) document.getElementById('setting-sound-alert').checked = s.soundAlert !== false;
    if (document.getElementById('setting-api-url')) document.getElementById('setting-api-url').value = s.apiUrl || '';
    if (document.getElementById('setting-username')) document.getElementById('setting-username').value = s.user || '';
    if (document.getElementById('setting-token')) document.getElementById('setting-token').value = s.token || '';
}

function saveFullSettingsFromPage() {
    state.settings.storeName = document.getElementById('setting-store-name')?.value.trim() || 'كاشير المطعم';
    state.settings.phone = document.getElementById('setting-store-phone')?.value.trim() || '';
    state.settings.currency = document.getElementById('setting-currency')?.value.trim() || 'ر.س';
    state.settings.storeAddress = document.getElementById('setting-store-address')?.value.trim() || '';
    state.settings.taxPercent = parseFloat(document.getElementById('setting-tax-percent')?.value) || 0;
    state.settings.tableServicePercent = parseFloat(document.getElementById('setting-table-service-percent')?.value) || 0;
    state.settings.cardFeePercent = parseFloat(document.getElementById('setting-card-fee-percent')?.value) || 0;
    state.settings.printerWidth = document.getElementById('setting-printer-width')?.value || '80mm';
    state.settings.receiptFooter = document.getElementById('setting-receipt-footer')?.value.trim() || '';
    state.settings.autoPrint = document.getElementById('setting-auto-print')?.checked ?? true;
    state.settings.soundAlert = document.getElementById('setting-sound-alert')?.checked ?? true;
    state.settings.apiUrl = document.getElementById('setting-api-url')?.value.trim() || '';
    state.settings.user = document.getElementById('setting-username')?.value.trim() || '';
    state.settings.token = document.getElementById('setting-token')?.value.trim() || '';

    saveSettingsToStorage();
    applySettingsToDOM();
    showToast('تم حفظ جميع الإعدادات الشاملة للمطعم والطباعة بنجاح! ✅', 'success');

    if (state.settings.apiUrl && state.settings.user && state.settings.token) {
        syncMenuData();
        startOrderPolling();
    }
}

function applyPresetToSettingsPage(key) {
    const preset = DEMO_PRESETS[key];
    if (!preset) return;

    if (document.getElementById('setting-api-url') && (!document.getElementById('setting-api-url').value || document.getElementById('setting-api-url').value.includes('example.com'))) {
        document.getElementById('setting-api-url').value = defaultApiUrl;
    }
    if (document.getElementById('setting-username')) document.getElementById('setting-username').value = preset.user;
    if (document.getElementById('setting-token')) document.getElementById('setting-token').value = preset.token;
    if (document.getElementById('setting-store-name')) document.getElementById('setting-store-name').value = preset.storeName;
    if (document.getElementById('setting-store-phone') && preset.phone) document.getElementById('setting-store-phone').value = preset.phone;

    showToast(`تم استيراد بيانات ${preset.storeName}! اضغط "حفظ كل التغييرات" لتطبيقها`, 'info');
}

function exportSystemBackup() {
    const backupData = {
        version: '3.2',
        exportedAt: new Date().toISOString(),
        settings: state.settings,
        categories: state.categories,
        items: state.items,
        tables: state.tables,
        employees: state.employees,
        payroll: state.payroll,
        expenses: state.expenses,
        ordersHistory: state.ordersHistory
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CODEART_POS_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('تم تصدير ملف النسخة الاحتياطية بنجاح 💾', 'success');
}

function importSystemBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.settings) {
                state.settings = { ...state.settings, ...data.settings };
                saveSettingsToStorage();
                applySettingsToDOM();
            }
            if (Array.isArray(data.categories)) state.categories = data.categories;
            if (Array.isArray(data.items)) {
                state.items = data.items;
                saveMenuData();
            }
            if (Array.isArray(data.tables)) {
                state.tables = data.tables;
                saveTables();
            }
            if (Array.isArray(data.employees)) {
                state.employees = data.employees;
                saveEmployees();
            }
            if (Array.isArray(data.payroll)) {
                state.payroll = data.payroll;
                savePayroll();
            }
            if (Array.isArray(data.expenses)) {
                state.expenses = data.expenses;
                saveExpenses();
            }
            if (Array.isArray(data.ordersHistory)) {
                state.ordersHistory = data.ordersHistory;
                saveOrdersHistory();
            }

            renderTables();
            renderHR();
            renderExpenses();
            renderReports();
            renderCategories();
            renderItems();
            renderSettingsPage();
            renderItemsManagement();

            showToast('تمت استعادة النسخة الاحتياطية بالكامل بنجاح! 🎉', 'success');
        } catch (err) {
            alert('عفواً، الملف غير صالح أو تالف: ' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function resetSystemDataConfirm() {
    if (!confirm('تحذير: هل أنت متأكد من رغبتك في إعادة ضبط بيانات النظام إلى الإعدادات الأولية؟ ستفقد التعديلات غير المحفوظة.')) {
        return;
    }
    localStorage.removeItem('codeart_pos_settings');
    localStorage.removeItem('codeart_pos_tables');
    localStorage.removeItem('codeart_pos_employees');
    localStorage.removeItem('codeart_pos_payroll');
    localStorage.removeItem('codeart_pos_expenses');
    localStorage.removeItem('codeart_pos_orders_history');
    localStorage.removeItem('codeart_pos_menu_cache');
    location.reload();
}

// =============================================================================
// نظام التثبيت كتطبيق مكتبي على الويندوز (Windows PWA Desktop App)
// =============================================================================
let deferredInstallPrompt = null;

function isAppInstalled() {
    const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                         window.navigator.standalone === true ||
                         (typeof document !== 'undefined' && document.referrer && document.referrer.includes('android-app://')) ||
                         localStorage.getItem('codeart_pwa_installed') === 'true';
    return !!isStandalone;
}

function updateInstallButtonVisibility() {
    const isInstalled = isAppInstalled();
    const btn = document.getElementById('btn-install-pwa');
    const mobileBtn = document.getElementById('mobile-btn-install-pwa');

    if (isInstalled) {
        if (document.body) document.body.classList.add('standalone-app');
        if (btn) btn.style.setProperty('display', 'none', 'important');
        if (mobileBtn) mobileBtn.style.setProperty('display', 'none', 'important');
    } else {
        if (btn && (!window.matchMedia || !window.matchMedia('(display-mode: standalone)').matches)) {
            // Keep default display or inline-flex if prompt is available
            btn.style.display = 'inline-flex';
        }
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (!isAppInstalled()) {
        const btn = document.getElementById('btn-install-pwa');
        if (btn) btn.style.display = 'inline-flex';
    }
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    localStorage.setItem('codeart_pwa_installed', 'true');
    updateInstallButtonVisibility();
    showToast('تم تثبيت التطبيق بنجاح على جهازك!', 'success');
});

function installDesktopApp() {
    if (isAppInstalled()) {
        showToast('التطبيق مثبت ويعمل بالفعل!', 'info');
        updateInstallButtonVisibility();
        return;
    }
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                localStorage.setItem('codeart_pwa_installed', 'true');
                updateInstallButtonVisibility();
                showToast('جاري تثبيت التطبيق على جهازك...', 'success');
            }
            deferredInstallPrompt = null;
        });
    } else if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
        showToast('التطبيق مثبت ويعمل بالفعل كنافذة مستقلة!', 'info');
        updateInstallButtonVisibility();
    } else {
        openModal('install-guide-modal');
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

// مراقبة أبعاد الشاشة لضمان عدم تسرب أي عناصر موبايل للكمبيوتر
window.addEventListener('resize', () => {
    const mobileCartBar = document.getElementById('mobile-cart-bar');
    if (window.innerWidth > 768) {
        if (mobileCartBar) mobileCartBar.style.display = 'none';
        if (typeof toggleMobileMoreMenu === 'function') toggleMobileMoreMenu(false);
        if (typeof toggleMobileCart === 'function') toggleMobileCart(false);
    } else {
        if (typeof updateTotals === 'function' && state && state.cart) {
            updateTotals();
        }
    }
});

// إتاحة الدوال الجديدة للنطاق العام (Global Scope)
window.setPaymentMethod = setPaymentMethod;
window.setOrderType = setOrderType;
window.toggleMobileCart = toggleMobileCart;
window.toggleMobileMoreMenu = toggleMobileMoreMenu;
window.filterTablesByZone = filterTablesByZone;
window.installDesktopApp = installDesktopApp;
window.saveTableOrderPartial = saveTableOrderPartial;

// دوال شاشة ونظام المطبخ (Kitchen Display System - KDS)
window.filterKitchenStation = filterKitchenStation;
window.markKitchenOrderDepartmentReady = markKitchenOrderDepartmentReady;
window.clearCompletedKitchenOrders = clearCompletedKitchenOrders;
window.printDepartmentKitchenSlip = printDepartmentKitchenSlip;
window.renderKitchenOrders = renderKitchenOrders;
window.isAppInstalled = isAppInstalled;
window.updateInstallButtonVisibility = updateInstallButtonVisibility;



