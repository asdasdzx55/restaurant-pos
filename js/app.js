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
// محرك تعدد المطاعم والعزل التخزيني (Smart Multi-Tenant Architecture)
// =============================================================================
function detectStoreTenant() {
    if (typeof window === 'undefined') return 'main';
    const params = new URLSearchParams(window.location.search);
    let tenant = params.get('store') || params.get('restaurant') || params.get('branch') || params.get('r') || '';

    // فحص إذا تم الدخول عبر نطاق فرعي مخصص (مثل syrianhouse.almagd555.com)
    if (!tenant && window.location.hostname) {
        const hostParts = window.location.hostname.split('.');
        if (hostParts.length >= 3 && !['www', 'codeart', 'pos', 'localhost', '127'].includes(hostParts[0])) {
            tenant = hostParts[0];
        }
    }

    if (tenant) {
        tenant = tenant.trim().toLowerCase().replace(/[^\w\u0600-\u06FF\-]/g, '_');
        try {
            localStorage.setItem('codeart_pos_active_tenant', tenant);
        } catch (e) {}
        window.__isExplicitStore = true;
        return tenant;
    }

    // إذا دخل بدون أي رابط مخصص ?store=
    window.__isExplicitStore = false;
    window.__needsStoreOnboarding = true;

    try {
        tenant = localStorage.getItem('codeart_pos_active_tenant') || 'main';
    } catch (e) {
        tenant = 'main';
    }
    return tenant;
}

const currentTenantId = detectStoreTenant();

// دوال إدارة التخزين المعزول لكل مطعم (Isolated Storage Engine)
function getTenantKey(baseKey) {
    const t = (typeof state !== 'undefined' && state && state.tenantId) ? state.tenantId : currentTenantId;
    return `${baseKey}_${t}`;
}

function getTenantStorage(baseKey) {
    const tKey = getTenantKey(baseKey);
    try {
        const val = localStorage.getItem(tKey);
        if (val !== null) return val;
        // توافق رجعي: إذا كان المطعم 'main' ولم تُحفظ بياناته بالمفتاح الجديد بعد، يتم جلب المفتاح القديم وترقيته تلقائياً
        const activeT = (typeof state !== 'undefined' && state && state.tenantId) ? state.tenantId : currentTenantId;
        if (activeT === 'main') {
            const oldVal = localStorage.getItem(baseKey);
            if (oldVal !== null) {
                localStorage.setItem(tKey, oldVal);
                return oldVal;
            }
        }
    } catch (e) {}
    return null;
}

function setTenantStorage(baseKey, val) {
    try {
        localStorage.setItem(getTenantKey(baseKey), val);
    } catch (e) {}
}

function removeTenantStorage(baseKey) {
    try {
        localStorage.removeItem(getTenantKey(baseKey));
    } catch (e) {}
}

// =============================================================================
// الحالة العامة للنظام (Application State)
// =============================================================================
const state = {
    tenantId: currentTenantId,
    currentView: 'pos',
    settings: {
        apiUrl: defaultApiUrl,
        user: (DEMO_PRESETS[currentTenantId] ? DEMO_PRESETS[currentTenantId].user : currentTenantId),
        token: (DEMO_PRESETS[currentTenantId] ? DEMO_PRESETS[currentTenantId].token : '8d7b85eba56b8091c674de6b262c4ffe'),
        storeSlug: currentTenantId,
        storeName: (DEMO_PRESETS[currentTenantId] ? DEMO_PRESETS[currentTenantId].storeName : (currentTenantId !== 'main' ? `مطعم ${currentTenantId.replace(/[_-]/g, ' ')}` : 'مطعم المدينة')),
        phone: (DEMO_PRESETS[currentTenantId] ? DEMO_PRESETS[currentTenantId].phone : '0501234567'),
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
    selectedKitchenStation: 'all',

    // نظام التوصيل والدليفري وتقفيل الحسابات
    deliveryFee: 0,
    selectedDriver: '',
    deliveryInfo: {
        name: '',
        phone: '',
        address: '',
        driver: '',
        fee: 0,
        notes: ''
    },
    customers: [],
    deliveryOrders: [],
    activeHubTab: 'drivers'
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

    // تفعيل قناة المزامنة الحية الفورية بين الشاشات والنوافذ (BroadcastChannel)
    initPosBroadcastChannel();

    // فحص ما إذا تم فتح التطبيق بدون رابط مطعم مخصص أو بدون إعدادات مسبقة
    const hasConfiguredApi = state.settings.apiUrl && state.settings.user && state.settings.token && state.settings.user !== 'main';
    if (window.__needsStoreOnboarding && !hasConfiguredApi) {
        setTimeout(() => openRestaurantOnboardingModal(true), 150);
    } else if (hasConfiguredApi) {
        syncMenuData();
        startOrderPolling();
    } else {
        setTimeout(() => openRestaurantOnboardingModal(true), 150);
    }

    // تحديث الإحصائيات الأولية
    renderTables();
    renderHR();
    renderExpenses();
    renderReports();
    updateKitchenBadge();
    updateDeliveryBadge();
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
// =============================================================================
// إدارة البيانات المحلية المعزولة لكل مطعم (Isolated ERP Persistence per Store)
// =============================================================================
function loadERPData() {
    // 1. الطاولات
    const savedTables = getTenantStorage('codeart_pos_tables');
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
    const savedEmployees = getTenantStorage('codeart_pos_employees');
    if (savedEmployees) {
        try { state.employees = JSON.parse(savedEmployees); } catch(e) {}
    }
    if (!state.employees || state.employees.length === 0) {
        state.employees = [
            { id: 1, name: 'أحمد محمود حسن', role: 'شيف رئيسي', phone: '0501122334', salary: 4500, salaryType: 'شهري', hireDate: '2025-01-10' },
            { id: 2, name: 'سامر خالد العلي', role: 'كاشير', phone: '0559988776', salary: 3200, salaryType: 'شهري', hireDate: '2025-03-01' },
            { id: 3, name: 'محمود عبد الله', role: 'ويتر (مقدم طعام)', phone: '0543322110', salary: 2800, salaryType: 'شهري', hireDate: '2025-05-15' },
            { id: 4, name: 'كريم يوسف', role: 'طيار توصيل (سائق دليفري)', phone: '0567788990', salary: 2600, salaryType: 'شهري', hireDate: '2025-06-20' }
        ];
        saveEmployees();
    }

    // 3. سجل مسير الرواتب
    const savedPayroll = getTenantStorage('codeart_pos_payroll');
    if (savedPayroll) {
        try { state.payroll = JSON.parse(savedPayroll); } catch(e) {}
    }

    // 4. المصاريف
    const savedExpenses = getTenantStorage('codeart_pos_expenses');
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
    const savedOrders = getTenantStorage('codeart_pos_orders_history');
    if (savedOrders) {
        try { state.ordersHistory = JSON.parse(savedOrders); } catch(e) {}
    }

    // 6. سجل طلبات أقسام المطبخ (KDS)
    const savedKitchen = getTenantStorage('codeart_pos_kitchen_orders');
    if (savedKitchen) {
        try { state.kitchenOrders = JSON.parse(savedKitchen); } catch(e) {}
    }
    if (!state.kitchenOrders) state.kitchenOrders = [];

    // 7. سجل عملاء التوصيل (CRM Customers Database)
    const savedCustomers = getTenantStorage('codeart_pos_customers');
    if (savedCustomers) {
        try { state.customers = JSON.parse(savedCustomers); } catch(e) {}
    }
    if (!state.customers || state.customers.length === 0) {
        state.customers = [
            { phone: '0501234567', name: 'أحمد محمود', address: 'حي المروة - شارع الأمل - عمارة 14 الدور 3 شقة 6', notes: 'يرن الجرس ولا يطرق الباب' },
            { phone: '0559876543', name: 'سارة خالد', address: 'حي النخيل - فيلا 28 بجانب مسجد الفردوس', notes: 'الدفع عند الاستلام كاش' },
            { phone: '0543210987', name: 'فيصل العتيبي', address: 'طريق الملك عبد العزيز - برج الياسمين مكتب 402', notes: 'الاتصال قبل الوصول بـ 5 دقائق' }
        ];
        saveCustomers();
    }

    // 8. سجل طلبات التوصيل وتقفيل الدليفري (Delivery Orders Hub)
    const savedDeliveryOrders = getTenantStorage('codeart_pos_delivery_orders');
    if (savedDeliveryOrders) {
        try { state.deliveryOrders = JSON.parse(savedDeliveryOrders); } catch(e) {}
    }
    if (!state.deliveryOrders || state.deliveryOrders.length === 0) {
        state.deliveryOrders = [
            {
                id: 'DEL-1041',
                customer_name: 'أحمد محمود',
                customer_phone: '0501234567',
                customer_address: 'حي المروة - شارع الأمل - عمارة 14 الدور 3',
                delivery_driver: 'كريم يوسف',
                delivery_fee: 15,
                subtotal: 180,
                total_price: 195,
                payment_method: 'cash',
                created_at: '17:15',
                status: 'out_for_delivery',
                items: [{ name: 'بيتزا سوبريم', quantity: 1, price: 120 }, { name: 'بطاطس ودجز', quantity: 2, price: 30 }]
            },
            {
                id: 'DEL-1042',
                customer_name: 'سارة خالد',
                customer_phone: '0559876543',
                customer_address: 'حي النخيل - فيلا 28 بجانب مسجد الفردوس',
                delivery_driver: 'كريم يوسف',
                delivery_fee: 15,
                subtotal: 140,
                total_price: 155,
                payment_method: 'cash',
                created_at: '17:30',
                status: 'out_for_delivery',
                items: [{ name: 'برجر كلاسيك دبل', quantity: 2, price: 50 }, { name: 'بيبسي عائلي', quantity: 1, price: 40 }]
            }
        ];
        saveDeliveryOrders();
    }

    // 9. ذاكرة المنيو المحلي (Offline-First Menu Cache)
    const cachedMenu = getTenantStorage('codeart_pos_menu_cache');
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

    // 10. قائمة الطلبات المعلقة للإرسال عند عودة النت (Offline Queue)
    const savedQueue = getTenantStorage('codeart_pos_offline_queue');
    if (savedQueue) {
        try { state.offlineOrdersQueue = JSON.parse(savedQueue); } catch(e) {}
    }
}

function saveTables() {
    setTenantStorage('codeart_pos_tables', JSON.stringify(state.tables));
    broadcastPosEvent('TABLE_STATUS_CHANGED', {});
}
function saveEmployees() { setTenantStorage('codeart_pos_employees', JSON.stringify(state.employees)); }
function savePayroll() { setTenantStorage('codeart_pos_payroll', JSON.stringify(state.payroll)); }
function saveExpenses() { setTenantStorage('codeart_pos_expenses', JSON.stringify(state.expenses)); }
function saveOfflineQueue() { setTenantStorage('codeart_pos_offline_queue', JSON.stringify(state.offlineOrdersQueue || [])); }
function saveOrdersHistory() { setTenantStorage('codeart_pos_orders_history', JSON.stringify(state.ordersHistory)); }
function saveMenuData() {
    setTenantStorage('codeart_pos_menu_cache', JSON.stringify({
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
    const saved = getTenantStorage('codeart_pos_settings');
    if (saved) {
        try { state.settings = { ...state.settings, ...JSON.parse(saved) }; } catch (e) {}
    } else {
        // إذا كان مطعماً جديداً
        if (DEMO_PRESETS[state.tenantId]) {
            const p = DEMO_PRESETS[state.tenantId];
            state.settings.user = p.user;
            state.settings.token = p.token;
            state.settings.storeName = p.storeName;
            state.settings.phone = p.phone;
        } else if (state.tenantId !== 'main') {
            state.settings.user = state.tenantId;
            state.settings.storeSlug = state.tenantId;
            state.settings.storeName = `مطعم ${state.tenantId.replace(/[_-]/g, ' ')}`;
        }
        saveSettingsToStorage();
    }
    applySettingsToDOM();
}

function saveSettingsToStorage() {
    setTenantStorage('codeart_pos_settings', JSON.stringify(state.settings));
}

function applySettingsToDOM() {
    const storeTitle = state.settings.storeName || 'كاشير المطعم';
    document.getElementById('brand-store-name').textContent = storeTitle;

    const headerTenantSlug = document.getElementById('header-tenant-slug');
    if (headerTenantSlug) headerTenantSlug.textContent = state.tenantId || 'main';

    const directLinkInput = document.getElementById('store-direct-link-input');
    if (directLinkInput) directLinkInput.value = getStoreShareUrl();

    const slugInput = document.getElementById('setting-store-slug');
    if (slugInput) slugInput.value = state.settings.storeSlug || state.tenantId || 'main';

    const modalDetailName = document.getElementById('modal-detail-store-name');
    if (modalDetailName) modalDetailName.textContent = storeTitle;

    const modalDetailSlug = document.getElementById('modal-detail-store-slug');
    if (modalDetailSlug) modalDetailSlug.textContent = state.tenantId || 'main';

    const modalDetailUrl = document.getElementById('modal-detail-store-url');
    if (modalDetailUrl) modalDetailUrl.value = getStoreShareUrl();

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

// دوال إدارة مشاركة الرابط المخصص والتبديل
function getStoreShareUrl() {
    const slug = (state.settings && state.settings.storeSlug) ? state.settings.storeSlug : (state.tenantId || 'main');
    if (typeof window === 'undefined') return `?store=${slug}`;
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('store', slug);
    return url.toString();
}

function copyStoreShareLink() {
    const link = getStoreShareUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => {
            showToast('📋 تم نسخ رابط الكاشير المخصص للمطعم بنجاح!', 'success');
        }).catch(() => fallbackCopy(link));
    } else {
        fallbackCopy(link);
    }
}

function fallbackCopy(text) {
    const temp = document.createElement('input');
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    document.body.removeChild(temp);
    showToast('📋 تم نسخ رابط الكاشير المخصص للمطعم بنجاح!', 'success');
}

function shareStoreWhatsApp() {
    const link = getStoreShareUrl();
    const name = state.settings.storeName || 'كاشير المطعم';
    const text = `مرحباً، هذا هو رابط الدخول المباشر لنظام كاشير ${name}:\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function openStoreDetailsModal() {
    const nameEl = document.getElementById('modal-detail-store-name');
    const slugEl = document.getElementById('modal-detail-store-slug');
    const urlEl = document.getElementById('modal-detail-store-url');

    if (nameEl) nameEl.textContent = state.settings.storeName || 'كاشير المطعم';
    if (slugEl) slugEl.textContent = state.tenantId || 'main';
    if (urlEl) urlEl.value = getStoreShareUrl();

    openModal('store-details-modal');
}

function openRestaurantOnboardingModal(isMandatory = false) {
    const modal = document.getElementById('restaurant-onboarding-modal');
    if (!modal) return;

    const closeBtn = document.getElementById('onboard-modal-close-btn');
    const cancelBtn = document.getElementById('onboard-cancel-btn');
    const errorBox = document.getElementById('onboard-error-msg');
    const title = document.getElementById('onboard-modal-title');
    const submitBtn = document.getElementById('onboard-submit-btn');

    if (errorBox) {
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-rocket"></i> توليد وتشغيل كاشير المطعم';
    }

    if (isMandatory) {
        if (closeBtn) closeBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (title) title.textContent = 'تهيئة وتوليد نظام الكاشير لمطعمك';
    } else {
        if (closeBtn) closeBtn.style.display = 'block';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
        if (title) title.textContent = 'ربط وتوليد مطعم جديد بالـ API';
    }

    const apiInput = document.getElementById('onboard-api-url');
    if (apiInput && !apiInput.value) {
        apiInput.value = (typeof defaultApiUrl !== 'undefined') ? defaultApiUrl : 'https://codeart.almagd555.com/api.php';
    }

    updateOnboardSlugPreview(document.getElementById('onboard-store-slug')?.value || '');
    openModal('restaurant-onboarding-modal');
}

function autoGenerateStoreSlug() {
    const slugInput = document.getElementById('onboard-store-slug');
    if (!slugInput || slugInput.dataset.manualEdited === 'true') return;
    const user = document.getElementById('onboard-api-user')?.value?.trim() || '';
    const name = document.getElementById('onboard-store-name')?.value?.trim() || '';
    let base = user || name;
    if (!base) {
        slugInput.value = '';
        updateOnboardSlugPreview('');
        return;
    }
    let slug = base.toLowerCase().replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF\-]/g, '');
    slugInput.value = slug;
    updateOnboardSlugPreview(slug);
}

function updateOnboardSlugPreview(slug) {
    const preview = document.getElementById('onboard-slug-preview');
    if (!preview) return;
    const cleanSlug = (slug || '...').trim().toLowerCase().replace(/[^\w\u0600-\u06FF\-]/g, '_');
    const base = (typeof window !== 'undefined') ? (window.location.origin + window.location.pathname) : 'https://codeart.almagd555.com/pos/';
    preview.textContent = `${base}?store=${cleanSlug}`;
}

async function submitRestaurantOnboarding() {
    const nameInput = document.getElementById('onboard-store-name');
    const apiUrlInput = document.getElementById('onboard-api-url');
    const userInput = document.getElementById('onboard-api-user');
    const tokenInput = document.getElementById('onboard-api-token');
    const slugInput = document.getElementById('onboard-store-slug');
    const errorBox = document.getElementById('onboard-error-msg');
    const submitBtn = document.getElementById('onboard-submit-btn');

    if (errorBox) {
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    const storeName = nameInput ? nameInput.value.trim() : '';
    const apiUrl = apiUrlInput ? apiUrlInput.value.trim() : '';
    const user = userInput ? userInput.value.trim() : '';
    const token = tokenInput ? tokenInput.value.trim() : '';
    let slug = slugInput ? slugInput.value.trim().toLowerCase().replace(/[^\w\u0600-\u06FF\-]/g, '_') : '';

    if (!storeName || !apiUrl || !user || !token || !slug) {
        if (errorBox) {
            errorBox.textContent = 'يرجى إكمال جميع الحقول المطلوبة: اسم المطعم، رابط الـ API، اسم المستخدم، والرمز السري (Token).';
            errorBox.style.display = 'block';
        }
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري فحص الـ API والتحقق من الصلاحيات...';
    }

    try {
        // التحقق من صحة مفاتيح الـ API فورياً مع السيرفر
        const testUrl = new URL(apiUrl);
        testUrl.searchParams.set('action', 'get_items');
        testUrl.searchParams.set('user', user);
        testUrl.searchParams.set('token', token);

        const res = await fetch(testUrl.toString(), { method: 'GET' });
        if (!res.ok) {
            let msg = `فشل الاتصال بالـ API (رمز الاستجابة: ${res.status})`;
            try {
                const errJson = await res.json();
                if (errJson.message) msg = errJson.message;
            } catch (e) {}
            throw new Error(msg);
        }

        const data = await res.json();
        if (data.status !== 'success') {
            throw new Error(data.message || 'بيانات الـ API أو التوكن غير صحيحة.');
        }

        // حفظ إعدادات المطعم الجديد المعزولة
        const newSettings = {
            storeName: storeName,
            storeSlug: slug,
            apiUrl: apiUrl,
            user: user,
            token: token,
            currency: 'ج.م',
            taxRate: 14,
            serviceFee: 12,
            autoPrint: true,
            pollInterval: 5000
        };

        localStorage.setItem(`codeart_pos_settings_${slug}`, JSON.stringify(newSettings));
        localStorage.setItem('codeart_pos_active_tenant', slug);

        // حفظ قائمة الأصناف في الكاش المحلي للمطعم
        if (data.categories || data.items) {
            localStorage.setItem(`codeart_pos_menu_cache_${slug}`, JSON.stringify({
                categories: data.categories || [],
                items: data.items || []
            }));
        }

        showToast(`🎉 تم توليد نظام الكاشير لمطعم "${storeName}" بنجاح!`, 'success');

        // الانتقال للرابط المخصص للمطعم
        setTimeout(() => {
            const destUrl = new URL(window.location.href);
            destUrl.search = '';
            destUrl.hash = '';
            destUrl.searchParams.set('store', slug);
            window.location.href = destUrl.toString();
        }, 600);

    } catch (err) {
        if (errorBox) {
            errorBox.textContent = `❌ خطأ في التحقق من الـ API: ${err.message}`;
            errorBox.style.display = 'block';
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-rocket"></i> توليد وتشغيل كاشير المطعم';
        }
    }
}

function saveStoreSlugChange() {
    const input = document.getElementById('setting-store-slug');
    if (!input || !input.value.trim()) return;
    const newSlug = input.value.trim().toLowerCase().replace(/[^\w\u0600-\u06FF\-]/g, '_');

    if (newSlug === state.tenantId) {
        showToast('هذا هو المعرّف النشط حالياً بالفعل', 'info');
        return;
    }

    if (!confirm(`هل تريد تغيير معرّف رابط المطعم من "${state.tenantId}" إلى "${newSlug}" والانتقال إليه؟`)) {
        return;
    }

    // نقل وتكرار بيانات المطعم الحالي للمعرّف الجديد
    const keys = [
        'codeart_pos_settings', 'codeart_pos_tables', 'codeart_pos_employees',
        'codeart_pos_payroll', 'codeart_pos_expenses', 'codeart_pos_orders_history',
        'codeart_pos_menu_cache', 'codeart_pos_kitchen_orders', 'codeart_pos_customers',
        'codeart_pos_delivery_orders'
    ];

    keys.forEach(k => {
        const val = localStorage.getItem(`${k}_${state.tenantId}`);
        if (val !== null) {
            localStorage.setItem(`${k}_${newSlug}`, val);
        }
    });

    state.settings.storeSlug = newSlug;
    saveSettingsToStorage();
    
    if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('store', newSlug);
        window.location.href = url.toString();
    }
}

// =============================================================================
// محرك المزامنة الحية الفورية (Live Cross-Screen Broadcast Engine)
// =============================================================================
let posBroadcastChannel = null;

function initPosBroadcastChannel() {
    try {
        if (typeof BroadcastChannel !== 'undefined' && state && state.tenantId) {
            posBroadcastChannel = new BroadcastChannel(`codeart_pos_channel_${state.tenantId}`);
            posBroadcastChannel.onmessage = (event) => {
                handleBroadcastSyncEvent(event.data);
            };
        }
    } catch (e) {}
}

function broadcastPosEvent(type, payload) {
    if (posBroadcastChannel) {
        try {
            posBroadcastChannel.postMessage({ type, payload, timestamp: Date.now() });
        } catch (e) {}
    }
}

function handleBroadcastSyncEvent(data) {
    if (!data || !data.type) return;
    if (data.type === 'NEW_ORDER') {
        playNotificationChime();
        if (data.payload) {
            if (!state.kitchenOrders) state.kitchenOrders = [];
            const exists = state.kitchenOrders.some(o => String(o.id) === String(data.payload.id));
            if (!exists) {
                state.kitchenOrders.unshift(data.payload);
                saveKitchenOrders();
                if (state.currentView === 'kitchen') renderKitchenOrders();
            }
        }
        showToast('🔔 طلب جديد متزامن من شاشة أخرى!', 'info');
    } else if (data.type === 'KITCHEN_ORDER_STATUS') {
        const savedKitchen = getTenantStorage('codeart_pos_kitchen_orders');
        if (savedKitchen) {
            try { state.kitchenOrders = JSON.parse(savedKitchen); } catch(e) {}
            if (state.currentView === 'kitchen') renderKitchenOrders();
        }
    } else if (data.type === 'TABLE_STATUS_CHANGED') {
        const savedTables = getTenantStorage('codeart_pos_tables');
        if (savedTables) {
            try { state.tables = JSON.parse(savedTables); } catch(e) {}
            if (state.currentView === 'tables') renderTablesGrid();
        }
    }
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
            setTenantStorage('codeart_pos_menu_cache', JSON.stringify({
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
    const deliveryCard = document.getElementById('delivery-card-summary');
    const btnSaveTable = document.getElementById('btn-save-table');

    if (state.orderType === 'dinein') {
        if (tableWrap) tableWrap.style.display = 'flex';
        if (deliveryCard) deliveryCard.style.display = 'none';
        if (btnSaveTable) {
            btnSaveTable.style.display = 'inline-flex';
            btnSaveTable.disabled = (state.cart.length === 0);
        }
    } else if (state.orderType === 'delivery') {
        if (tableWrap) tableWrap.style.display = 'none';
        if (deliveryCard) {
            deliveryCard.style.display = 'block';
            updateDeliveryCardDisplay();
        }
        if (btnSaveTable) btnSaveTable.style.display = 'none';
    } else {
        // takeaway (سفري / تكاوي)
        if (tableWrap) tableWrap.style.display = 'none';
        if (deliveryCard) deliveryCard.style.display = 'none';
        if (btnSaveTable) btnSaveTable.style.display = 'none';
    }

    // تحديث الحسابات الخاصة بالضريبة ورسوم الصالة ورسوم التوصيل
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

    // 3. خدمة التوصيل والدليفري (تطبق فقط عند اختيار توصيل)
    const deliveryFee = (state.orderType === 'delivery') ? Number(state.deliveryFee || 0) : 0;

    // 4. ضريبة القيمة المضافة
    const taxRate = Number(state.settings.taxPercent || 0) / 100;
    const taxableBase = subtotal + tableServiceFee + cardFee + deliveryFee;
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

    const rowDeliveryFee = document.getElementById('row-delivery-fee');
    const summaryDeliveryFee = document.getElementById('summary-delivery-fee');
    if (rowDeliveryFee && summaryDeliveryFee) {
        if (state.orderType === 'delivery' && deliveryFee > 0) {
            rowDeliveryFee.style.display = 'flex';
            summaryDeliveryFee.textContent = `+${deliveryFee.toFixed(2)} ${state.settings.currency}`;
        } else {
            rowDeliveryFee.style.display = 'none';
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

    // إذا كان نوع الطلب توصيل، نتأكد من إدخال بيانات العميل وعنوان التوصيل
    if (state.orderType === 'delivery') {
        if (!state.deliveryInfo || !state.deliveryInfo.name || !state.deliveryInfo.address) {
            showToast('يرجى استكمال بيانات العميل وعنوان التوصيل أولاً 🛵', 'warning');
            openDeliveryDetailsModal();
            return;
        }
    }

    const subtotal = state.cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    const tableServicePercent = (state.orderType === 'dinein') ? Number(state.settings.tableServicePercent || 0) : 0;
    const tableServiceFee = (subtotal * tableServicePercent) / 100;
    const cardFeePercent = (state.paymentMethod === 'card') ? Number(state.settings.cardFeePercent || 0) : 0;
    const cardFee = (subtotal * cardFeePercent) / 100;
    const deliveryFee = (state.orderType === 'delivery') ? Number(state.deliveryFee || 0) : 0;
    const taxRate = Number(state.settings.taxPercent || 0) / 100;
    const taxableBase = subtotal + tableServiceFee + cardFee + deliveryFee;
    const taxAmount = taxableBase * taxRate;
    const grandTotal = taxableBase + taxAmount;

    const itemsFormatted = state.cart.map(c => ({
        id: c.itemId,
        name: c.name + (c.variation ? ` (${c.variation})` : ''),
        price: c.price,
        quantity: c.quantity,
        note: c.note || ''
    }));

    const tableLabel = document.getElementById('table-num-input')?.value.trim() || 'طاولة 1';
    const orderPayload = {
        username: state.settings.user,
        customer_name: state.orderType === 'delivery' ? (state.deliveryInfo?.name || 'عميل توصيل') : 'عميل المطعم',
        customer_phone: state.orderType === 'delivery' ? (state.deliveryInfo?.phone || '') : '',
        customer_address: state.orderType === 'delivery' ? (state.deliveryInfo?.address || '') : '',
        delivery_driver: state.orderType === 'delivery' ? (state.deliveryInfo?.driver || 'بانتظار سائق') : '',
        delivery_fee: deliveryFee,
        delivery_notes: state.orderType === 'delivery' ? (state.deliveryInfo?.notes || '') : '',
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

    // إذا كان الطلب دليفري، نضيفه إلى سجل طلبات التوصيل وتقفيل الدليفري
    if (state.orderType === 'delivery') {
        if (!state.deliveryOrders) state.deliveryOrders = [];
        state.deliveryOrders.unshift({
            id: orderId,
            customer_name: orderPayload.customer_name,
            customer_phone: orderPayload.customer_phone,
            customer_address: orderPayload.customer_address,
            delivery_driver: orderPayload.delivery_driver,
            delivery_fee: orderPayload.delivery_fee,
            delivery_notes: orderPayload.delivery_notes,
            subtotal: orderPayload.subtotal,
            total_price: orderPayload.total_price,
            payment_method: orderPayload.payment_method,
            created_at: orderPayload.created_at,
            items: orderPayload.items,
            status: 'out_for_delivery'
        });
        saveDeliveryOrders();
        updateDeliveryBadge();

        // حفظ بيانات العميل في سجل العملاء للبحث والاسترجاع التلقائي
        if (orderPayload.customer_phone) {
            saveCustomerToDb({
                phone: orderPayload.customer_phone,
                name: orderPayload.customer_name,
                address: orderPayload.customer_address,
                notes: orderPayload.delivery_notes
            });
        }

        // تفريغ بيانات التوصيل للطلب التالي
        resetDeliveryInfo();
    }

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
    renderTables();
}

function renderTables() {
    const container = document.getElementById('tables-grid-container');
    if (!container) return;
    container.innerHTML = '';

    const total = state.tables.length;
    const vacant = state.tables.filter(t => t.status === 'vacant').length;
    const occupied = state.tables.filter(t => t.status === 'occupied' || t.status === 'billed').length;
    const revenue = state.tables.reduce((sum, t) => sum + (t.orderTotal || 0), 0);

    const kpiTotal = document.getElementById('kpi-total-tables');
    const kpiVacant = document.getElementById('kpi-vacant-tables');
    const kpiOccupied = document.getElementById('kpi-occupied-tables');
    const kpiRev = document.getElementById('kpi-tables-revenue');

    if (kpiTotal) kpiTotal.textContent = total;
    if (kpiVacant) kpiVacant.textContent = vacant;
    if (kpiOccupied) kpiOccupied.textContent = occupied;
    if (kpiRev) kpiRev.textContent = `${revenue.toFixed(2)} ${state.settings.currency}`;

    if (state.tables.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 45px 20px; background: #fff; border-radius: 14px; border: 1px dashed var(--border-color); color: #94a3b8;">
                <i class="fas fa-layer-group" style="font-size: 2.8rem; margin-bottom: 12px; opacity: 0.5;"></i>
                <div style="font-weight: 700; font-size: 1.1rem; color: #64748b;">لا توجد طاولات مضافة في النظام حالياً</div>
                <p style="margin-top: 6px; font-size: 0.85rem;">اضغط على "إضافة طاولة جديدة" بالأعلى لتسجيل طاولات الصالة والتراس</p>
            </div>
        `;
        return;
    }

    // تعريف بيانات وترتيب المناطق الأساسية
    const zoneMeta = {
        'indoor': { name: 'الصالة الداخلية (Indoor)', icon: 'fa-home', color: '#0284c7' },
        'outdoor': { name: 'الجلسات الخارجية / التراس (Outdoor)', icon: 'fa-tree', color: '#10b981' },
        'vip': { name: 'صالة خاصة و VIP', icon: 'fa-crown', color: '#f59e0b' },
        'family': { name: 'قسم العوائل (Family)', icon: 'fa-users', color: '#8b5cf6' }
    };

    // تجميع الطاولات حسب المنطقة
    const groups = {};
    state.tables.forEach(t => {
        const z = t.zone || 'indoor';
        if (!groups[z]) groups[z] = [];
        groups[z].push(t);
    });

    // ترتيب العرض: indoor أولاً ثم outdoor ثم vip ثم family ثم أي مناطق أخرى
    const orderedZones = Object.keys(groups).sort((a, b) => {
        const order = { 'indoor': 1, 'outdoor': 2, 'vip': 3, 'family': 4 };
        return (order[a] || 99) - (order[b] || 99);
    });

    orderedZones.forEach(zKey => {
        const zoneTables = groups[zKey];
        const meta = zoneMeta[zKey] || { name: `قسم ${zKey}`, icon: 'fa-couch', color: '#475569' };

        const sec = document.createElement('div');
        sec.className = 'zone-section';

        sec.innerHTML = `
            <div class="zone-section-header">
                <div class="zone-title" style="color: ${meta.color};">
                    <i class="fas ${meta.icon}"></i>
                    <span>${meta.name}</span>
                    <span class="zone-count-chip">${zoneTables.length} طاولة</span>
                </div>
                <div class="zone-divider-line"></div>
            </div>
            <div class="zone-tables-grid"></div>
        `;

        const grid = sec.querySelector('.zone-tables-grid');

        zoneTables.forEach(table => {
            const chip = document.createElement('div');
            const status = table.status || 'vacant';
            chip.className = `table-chip ${status}`;
            chip.title = `${table.name} (${status === 'vacant' ? 'فارغة ومتاحة' : 'مشغولة - اضغط للخيارات'})`;
            chip.onclick = () => openTableActionModal(table.id);

            let contentHtml = '';
            if (status === 'vacant') {
                contentHtml = `
                    <div class="table-chip-number">${escapeHtml(table.name)}</div>
                    <div class="table-chip-status"><i class="fas fa-check"></i> متاحة</div>
                    <div class="table-chip-seats"><i class="fas fa-chair"></i> ${table.seats || 4}</div>
                `;
            } else if (status === 'occupied') {
                const count = (table.orderItems || []).length;
                contentHtml = `
                    <div class="table-chip-badge">${count} صنف</div>
                    <div class="table-chip-number">${escapeHtml(table.name)}</div>
                    <div class="table-chip-total">${Number(table.orderTotal || 0).toFixed(0)} ${state.settings.currency}</div>
                `;
            } else { // billed
                contentHtml = `
                    <div class="table-chip-badge" style="background:#f59e0b;">فاتورة</div>
                    <div class="table-chip-number">${escapeHtml(table.name)}</div>
                    <div class="table-chip-total">${Number(table.orderTotal || 0).toFixed(0)} ${state.settings.currency}</div>
                `;
            }

            chip.innerHTML = contentHtml;
            grid.appendChild(chip);
        });

        container.appendChild(sec);
    });
}

function openTableActionModal(tableId) {
    const table = state.tables.find(t => t.id === tableId);
    if (!table) return;

    state.selectedModalTableId = table.id;

    const titleEl = document.getElementById('tam-title');
    const subEl = document.getElementById('tam-subtitle');
    const iconBox = document.getElementById('tam-icon-box');

    const zoneNames = {
        'indoor': 'الصالة الداخلية',
        'outdoor': 'الجلسات الخارجية',
        'vip': 'VIP وعوائل',
        'family': 'قسم العوائل'
    };
    const zoneName = zoneNames[table.zone] || table.zone || 'الصالة الداخلية';

    if (titleEl) titleEl.textContent = table.name;
    if (subEl) subEl.textContent = `${zoneName} • سعة ${table.seats || 4} كراسي`;

    const occView = document.getElementById('tam-occupied-view');
    const vacView = document.getElementById('tam-vacant-view');
    const transferPanel = document.getElementById('tam-transfer-panel');
    if (transferPanel) transferPanel.style.display = 'none';

    if (table.status === 'occupied' || table.status === 'billed') {
        if (occView) occView.style.display = 'block';
        if (vacView) vacView.style.display = 'none';

        if (iconBox) {
            iconBox.style.background = '#fee2e2';
            iconBox.style.color = '#dc2626';
            iconBox.innerHTML = '<i class="fas fa-utensils"></i>';
        }

        const openAtEl = document.getElementById('tam-opened-at');
        const totalEl = document.getElementById('tam-order-total');
        const itemsList = document.getElementById('tam-items-list');

        if (openAtEl) openAtEl.textContent = table.openedAt || 'منذ قليل';
        if (totalEl) totalEl.textContent = `${Number(table.orderTotal || 0).toFixed(2)} ${state.settings.currency}`;

        if (itemsList) {
            if (!table.orderItems || table.orderItems.length === 0) {
                itemsList.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem; padding: 6px;">لا توجد أصناف مسجلة</div>';
            } else {
                itemsList.innerHTML = table.orderItems.map(it => `
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #f1f5f9; padding-bottom: 4px; font-size: 0.84rem;">
                        <div>
                            <span style="font-weight: 700; color: #1e293b;">${escapeHtml(it.name)}</span>
                            <span style="color: #64748b; font-size: 0.76rem; margin-right: 4px;">× ${it.quantity}</span>
                            ${it.note ? `<div style="font-size: 0.72rem; color: #e11d48;"><i class="fas fa-comment-dots"></i> ${escapeHtml(it.note)}</div>` : ''}
                        </div>
                        <div style="font-weight: 800; color: #0f172a;">
                            ${(Number(it.price) * Number(it.quantity)).toFixed(2)} ${state.settings.currency}
                        </div>
                    </div>
                `).join('');
            }
        }

        // تعبئة قائمة الطاولات الفارغة للنقل
        const select = document.getElementById('tam-transfer-target-select');
        if (select) {
            const vacantTables = state.tables.filter(t => t.id !== table.id && t.status === 'vacant');
            if (vacantTables.length === 0) {
                select.innerHTML = '<option value="">لا توجد طاولات فارغة أخرى حالياً</option>';
            } else {
                select.innerHTML = vacantTables.map(vt => `
                    <option value="${vt.id}">${escapeHtml(vt.name)} (${zoneNames[vt.zone] || vt.zone || 'صالة'})</option>
                `).join('');
            }
        }
    } else {
        // فارغة (Vacant)
        if (occView) occView.style.display = 'none';
        if (vacView) vacView.style.display = 'block';

        if (iconBox) {
            iconBox.style.background = '#ecfdf5';
            iconBox.style.color = '#059669';
            iconBox.innerHTML = '<i class="fas fa-chair"></i>';
        }
    }

    openModal('table-action-modal');
}

function handleTamAddItems() {
    closeModal('table-action-modal');
    if (state.selectedModalTableId) {
        openTableInPOS(state.selectedModalTableId);
    }
}

function handleTamCheckout() {
    closeModal('table-action-modal');
    if (state.selectedModalTableId) {
        checkoutTableDirectly(state.selectedModalTableId);
    }
}

function handleTamShowTransfer() {
    const panel = document.getElementById('tam-transfer-panel');
    if (panel) {
        panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
    }
}

function handleTamConfirmTransfer() {
    const select = document.getElementById('tam-transfer-target-select');
    if (!select || !select.value) {
        showToast('يرجى اختيار طاولة فارغة لنقل الطلب إليها', 'warning');
        return;
    }
    const targetId = Number(select.value);
    transferTable(state.selectedModalTableId, targetId);
}

function handleTamClearTable() {
    if (state.selectedModalTableId) {
        clearTableWithoutCheckout(state.selectedModalTableId);
        closeModal('table-action-modal');
    }
}

function handleTamNewOrder() {
    closeModal('table-action-modal');
    if (state.selectedModalTableId) {
        openTableInPOS(state.selectedModalTableId);
    }
}

function handleTamEditTable() {
    closeModal('table-action-modal');
    if (state.selectedModalTableId) {
        openEditTableModal(state.selectedModalTableId);
    }
}

function handleTamDeleteTable() {
    if (state.selectedModalTableId) {
        deleteTable(state.selectedModalTableId);
        closeModal('table-action-modal');
    }
}

function transferTable(sourceId, targetId) {
    const source = state.tables.find(t => t.id === sourceId);
    const target = state.tables.find(t => t.id === targetId);

    if (!source || !target) {
        showToast('تعذر العثور على بيانات الطاولة', 'error');
        return;
    }

    if (!confirm(`هل تريد نقل طلب الحساب بالكامل من "${source.name}" إلى "${target.name}"؟`)) {
        return;
    }

    // نقل الطلب
    target.status = 'occupied';
    target.orderItems = [...(source.orderItems || [])];
    target.orderTotal = Number(source.orderTotal) || 0;
    target.openedAt = source.openedAt || new Date().toLocaleTimeString('ar-SA');

    // إخلاء المصدر
    source.status = 'vacant';
    source.orderItems = [];
    source.orderTotal = 0;
    source.openedAt = null;

    if (state.activeTableId === sourceId) {
        state.activeTableId = target.id;
        const input = document.getElementById('table-num-input');
        if (input) input.value = target.name;
    }

    saveTables();
    renderTables();
    closeModal('table-action-modal');
    showToast(`🎉 تم نقل طلب "${source.name}" إلى "${target.name}" بنجاح!`, 'success');
}

function openEditTableModal(tableId) {
    const table = state.tables.find(t => t.id === tableId);
    if (!table) return;

    const modalTitle = document.getElementById('add-table-modal-title');
    const editIdInput = document.getElementById('input-edit-table-id');
    const nameInput = document.getElementById('input-new-table-name');
    const zoneSelect = document.getElementById('input-new-table-zone');
    const seatsInput = document.getElementById('input-new-table-seats');
    const notesInput = document.getElementById('input-new-table-notes');

    if (modalTitle) modalTitle.innerHTML = `<i class="fas fa-edit"></i> تعديل بيانات ${escapeHtml(table.name)}`;
    if (editIdInput) editIdInput.value = table.id;
    if (nameInput) nameInput.value = table.name;
    if (zoneSelect) zoneSelect.value = table.zone || 'indoor';
    if (seatsInput) seatsInput.value = table.seats || 4;
    if (notesInput) notesInput.value = table.notes || '';

    openModal('add-table-modal');
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
    setTenantStorage('codeart_pos_kitchen_orders', JSON.stringify(state.kitchenOrders || []));
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
    broadcastPosEvent('NEW_ORDER', kdsOrder);

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
    broadcastPosEvent('KITCHEN_ORDER_STATUS', {});
    const deptTitle = KITCHEN_DEPARTMENTS[departmentKey]?.name || 'الطلب';
    showToast(`تم وضع ${deptTitle} للطلب #${order.orderNumber} كجاهز!`, 'success');
    renderKitchenOrders();
}

function clearCompletedKitchenOrders() {
    state.kitchenOrders = (state.kitchenOrders || []).filter(o => o.status !== 'ready');
    saveKitchenOrders();
    broadcastPosEvent('KITCHEN_ORDER_STATUS', {});
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
// نظام التوصيل والدليفري وتقفيل الحسابات (Delivery & Settlement Hub Engine)
// =============================================================================

function saveCustomers() {
    try {
        setTenantStorage('codeart_pos_customers', JSON.stringify(state.customers || []));
    } catch(e) {}
}

function saveDeliveryOrders() {
    try {
        setTenantStorage('codeart_pos_delivery_orders', JSON.stringify(state.deliveryOrders || []));
    } catch(e) {}
}

function updateDeliveryBadge() {
    const badge = document.getElementById('delivery-hub-badge');
    if (!badge) return;
    const activeCount = (state.deliveryOrders || []).filter(o => o.status === 'out_for_delivery').length;
    if (activeCount > 0) {
        badge.style.display = 'inline-flex';
        badge.textContent = activeCount;
    } else {
        badge.style.display = 'none';
    }
}

// 1. استرجاع بيانات العميل تلقائياً بمجرد إدخال رقم الهاتف (Customer Phone Lookup)
function handleCustomerPhoneInput(phone) {
    const cleanPhone = String(phone || '').replace(/[^\d+]/g, '').trim();
    const badge = document.getElementById('cust-lookup-badge');
    const nameInput = document.getElementById('delivery-input-name');
    const addressInput = document.getElementById('delivery-input-address');
    const notesInput = document.getElementById('delivery-input-notes');

    if (!cleanPhone || cleanPhone.length < 7) {
        if (badge) badge.style.display = 'none';
        return;
    }

    // البحث في سجل العملاء المحفوظ
    const foundCust = (state.customers || []).find(c => {
        const cPhone = String(c.phone || '').replace(/[^\d+]/g, '').trim();
        return cPhone && (cPhone === cleanPhone || cPhone.endsWith(cleanPhone) || cleanPhone.endsWith(cPhone));
    });

    if (foundCust) {
        if (nameInput && (!nameInput.value || nameInput.value.trim() === 'عميل توصيل')) {
            nameInput.value = foundCust.name || '';
        }
        if (addressInput && !addressInput.value) {
            addressInput.value = foundCust.address || '';
        }
        if (notesInput && !notesInput.value && foundCust.notes) {
            notesInput.value = foundCust.notes;
        }
        if (badge) {
            badge.style.display = 'inline-block';
            badge.textContent = `✨ عميل مسجل: ${foundCust.name}`;
        }
        showToast(`تم استرجاع بيانات العميل "${foundCust.name}" تلقائياً! ⚡`, 'info');
    } else {
        if (badge) badge.style.display = 'none';
    }
}

// 2. تعبئة قائمة مناديب وسائقي التوصيل (Delivery Drivers)
function populateDeliveryDriversDropdown(selectedDriverVal) {
    const select = document.getElementById('delivery-driver-select');
    if (!select) return;

    // استخراج الموظفين الذين يحملون مسمى وظيفي خاص بالتوصيل أو الدليفري أو طيار
    const driverEmployees = (state.employees || []).filter(e => {
        const role = String(e.role || '').toLowerCase();
        return role.includes('توصيل') || role.includes('ديليفري') || role.includes('دليفري') || role.includes('طيار') || role.includes('سائق');
    });

    let optionsHtml = `<option value="">-- اختر طيار التوصيل (أو اتركه لتعيينه لاحقاً) --</option>`;
    
    if (driverEmployees.length === 0) {
        optionsHtml += `<option value="كريم يوسف">كريم يوسف (طيار دليفري)</option>`;
    } else {
        driverEmployees.forEach(d => {
            optionsHtml += `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)} (${escapeHtml(d.role)})</option>`;
        });
    }

    optionsHtml += `<option value="__custom__">➕ مندوب خارجي / كتابة اسم جديد...</option>`;
    select.innerHTML = optionsHtml;

    if (selectedDriverVal) {
        const exists = Array.from(select.options).some(opt => opt.value === selectedDriverVal);
        if (exists) {
            select.value = selectedDriverVal;
            const customInput = document.getElementById('delivery-driver-custom-input');
            if (customInput) customInput.style.display = 'none';
        } else {
            select.value = '__custom__';
            const customInput = document.getElementById('delivery-driver-custom-input');
            if (customInput) {
                customInput.style.display = 'block';
                customInput.value = selectedDriverVal;
            }
        }
    }
}

function handleDeliveryDriverSelect(val) {
    const customInput = document.getElementById('delivery-driver-custom-input');
    if (val === '__custom__') {
        if (customInput) {
            customInput.style.display = 'block';
            customInput.focus();
        }
    } else {
        if (customInput) {
            customInput.style.display = 'none';
            customInput.value = '';
        }
    }
}

// 3. تحديد رسوم التوصيل السريعة
function setDeliveryFeeQuick(amount, updateInput = true) {
    const num = Math.max(0, parseFloat(amount) || 0);
    state.deliveryFee = num;
    if (state.deliveryInfo) state.deliveryInfo.fee = num;

    const displayEl = document.getElementById('delivery-fee-display-val');
    if (displayEl) displayEl.textContent = `${num.toFixed(2)} ${state.settings.currency}`;

    const inputEl = document.getElementById('delivery-input-fee');
    if (inputEl && updateInput) inputEl.value = num;

    document.querySelectorAll('.btn-fee-chip').forEach(btn => {
        const val = parseFloat(btn.textContent) || 0;
        if ((val === 0 && num === 0 && btn.textContent.includes('مجاني')) || (val === num)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    updateTotals();
}

// 4. فتح نافذة إدخال بيانات التوصيل
function openDeliveryDetailsModal() {
    populateDeliveryDriversDropdown(state.deliveryInfo?.driver || '');
    
    const info = state.deliveryInfo || {};
    const phoneInput = document.getElementById('delivery-input-phone');
    const nameInput = document.getElementById('delivery-input-name');
    const addressInput = document.getElementById('delivery-input-address');
    const notesInput = document.getElementById('delivery-input-notes');

    if (phoneInput) phoneInput.value = info.phone || '';
    if (nameInput) nameInput.value = info.name || '';
    if (addressInput) addressInput.value = info.address || '';
    if (notesInput) notesInput.value = info.notes || '';

    setDeliveryFeeQuick(info.fee !== undefined ? info.fee : (state.deliveryFee || 0));

    if (info.phone) handleCustomerPhoneInput(info.phone);

    openModal('delivery-order-modal');
}

// 5. حفظ بيانات التوصيل من النافذة
function saveDeliveryModalData() {
    const phoneInput = document.getElementById('delivery-input-phone');
    const nameInput = document.getElementById('delivery-input-name');
    const addressInput = document.getElementById('delivery-input-address');
    const notesInput = document.getElementById('delivery-input-notes');
    const driverSelect = document.getElementById('delivery-driver-select');
    const customDriverInput = document.getElementById('delivery-driver-custom-input');
    const feeInput = document.getElementById('delivery-input-fee');

    const phone = phoneInput ? phoneInput.value.trim() : '';
    const name = nameInput ? nameInput.value.trim() : '';
    const address = addressInput ? addressInput.value.trim() : '';
    const notes = notesInput ? notesInput.value.trim() : '';
    const fee = feeInput ? (parseFloat(feeInput.value) || 0) : 0;

    let driver = driverSelect ? driverSelect.value : '';
    if (driver === '__custom__' && customDriverInput) {
        driver = customDriverInput.value.trim();
    }

    if (!name) {
        showToast('يرجى كتابة اسم العميل', 'warning');
        return;
    }
    if (!address) {
        showToast('يرجى كتابة عنوان التوصيل بالتفصيل', 'warning');
        return;
    }

    state.deliveryInfo = {
        phone,
        name,
        address,
        notes,
        driver: driver || 'بانتظار سائق',
        fee
    };
    state.deliveryFee = fee;

    updateDeliveryCardDisplay();

    if (phone) {
        saveCustomerToDb({ phone, name, address, notes });
    }

    closeModal('delivery-order-modal');
    updateTotals();
    showToast('تم حفظ وتحديث بيانات التوصيل بنجاح! 🛵', 'success');
}

function updateDeliveryCardDisplay() {
    const info = state.deliveryInfo || {};
    const nameEl = document.getElementById('display-delivery-cust-name');
    const phoneEl = document.getElementById('display-delivery-cust-phone');
    const addressEl = document.getElementById('display-delivery-cust-address');
    const driverEl = document.getElementById('display-delivery-driver');
    const feeEl = document.getElementById('display-delivery-fee');

    if (nameEl) nameEl.innerHTML = `<i class="fas fa-user"></i> ${escapeHtml(info.name || 'عميل توصيل')}`;
    if (phoneEl) phoneEl.innerHTML = `<i class="fas fa-phone"></i> ${escapeHtml(info.phone || 'بدون هاتف')}`;
    if (addressEl) addressEl.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${escapeHtml(info.address || 'العنوان غير محدد')}`;
    if (driverEl) driverEl.innerHTML = `<i class="fas fa-biking"></i> ${escapeHtml(info.driver || 'بانتظار طيار')}`;
    if (feeEl) feeEl.innerHTML = `<i class="fas fa-tag"></i> خدمة: ${(info.fee || 0).toFixed(2)} ${state.settings.currency}`;
}

function resetDeliveryInfo() {
    state.deliveryInfo = {
        name: '',
        phone: '',
        address: '',
        driver: '',
        fee: 0,
        notes: ''
    };
    state.deliveryFee = 0;
    updateDeliveryCardDisplay();
}

function saveCustomerToDb(cust) {
    if (!cust.phone) return;
    if (!state.customers) state.customers = [];
    const cleanPhone = String(cust.phone).replace(/[^\d+]/g, '').trim();
    const idx = state.customers.findIndex(c => String(c.phone).replace(/[^\d+]/g, '').trim() === cleanPhone);
    if (idx >= 0) {
        state.customers[idx] = { ...state.customers[idx], ...cust };
    } else {
        state.customers.push(cust);
    }
    saveCustomers();
}

// =============================================================================
// شاشة وإدارة تقفيل الدليفري (Delivery Settlement Hub)
// =============================================================================

function openDeliveryHubModal() {
    renderDeliveryHub();
    openModal('delivery-hub-modal');
}

function switchDeliveryHubTab(tabName) {
    state.activeHubTab = tabName;
    ['drivers', 'orders', 'history', 'returned'].forEach(t => {
        const btn = document.getElementById(`hub-tab-${t}`);
        const sec = document.getElementById(`hub-section-${t}`);
        if (btn) btn.classList.toggle('active', t === tabName);
        if (sec) sec.style.display = (t === tabName) ? 'block' : 'none';
    });
    renderDeliveryHub();
}

function renderDeliveryHub() {
    const orders = state.deliveryOrders || [];
    const activeOrders = orders.filter(o => o.status === 'out_for_delivery');
    const settledOrders = orders.filter(o => o.status === 'settled');
    const returnedOrders = orders.filter(o => o.status === 'returned');

    const cashToCollect = activeOrders
        .filter(o => (o.payment_method || 'cash') === 'cash')
        .reduce((sum, o) => sum + Number(o.total_price || 0), 0);

    const kpiActive = document.getElementById('hub-kpi-active-count');
    const kpiCash = document.getElementById('hub-kpi-cash-to-collect');
    const kpiSettled = document.getElementById('hub-kpi-settled-count');
    const kpiReturned = document.getElementById('hub-kpi-returned-count');

    if (kpiActive) kpiActive.textContent = activeOrders.length;
    if (kpiCash) kpiCash.textContent = `${cashToCollect.toFixed(2)} ${state.settings.currency}`;
    if (kpiSettled) kpiSettled.textContent = settledOrders.length;
    if (kpiReturned) kpiReturned.textContent = returnedOrders.length;

    updateDeliveryBadge();

    renderDriversSettlementCards(activeOrders);
    renderActiveDeliveryOrders(activeOrders);
    renderSettledDeliveryOrders(settledOrders);
    renderReturnedDeliveryOrders(returnedOrders);
}

function renderDriversSettlementCards(activeOrders) {
    const grid = document.getElementById('hub-drivers-grid');
    if (!grid) return;

    const driversMap = {};
    activeOrders.forEach(o => {
        const driver = o.delivery_driver || 'غير محدد';
        if (!driversMap[driver]) {
            driversMap[driver] = {
                name: driver,
                orders: [],
                totalCash: 0,
                totalOrders: 0
            };
        }
        driversMap[driver].orders.push(o);
        driversMap[driver].totalOrders++;
        if ((o.payment_method || 'cash') === 'cash') {
            driversMap[driver].totalCash += Number(o.total_price || 0);
        }
    });

    const driverKeys = Object.keys(driversMap);
    if (driverKeys.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #94a3b8;">
                <i class="fas fa-check-circle" style="font-size: 3rem; color: #10b981; margin-bottom: 10px; display: block;"></i>
                <div style="font-weight: 800; font-size: 1.1rem; color: #0f172a;">جميع حسابات وعهد الطيارين مقفلة بالكامل! 🎉</div>
                <p style="font-size: 0.85rem; margin-top: 4px;">لا توجد أي مبالغ نقدية معلقة مع مناديب التوصيل حالياً</p>
            </div>
        `;
        return;
    }

    let html = '';
    driverKeys.forEach(key => {
        const d = driversMap[key];
        const orderIdsText = d.orders.map(o => `#${o.id}`).join('، ');
        html += `
            <div class="driver-settlement-card">
                <div class="driver-card-header">
                    <div class="driver-avatar-box"><i class="fas fa-biking"></i></div>
                    <div class="driver-info-main">
                        <h4>${escapeHtml(d.name)}</h4>
                        <span>طيار توصيل • ${d.totalOrders} طلبات جارية</span>
                    </div>
                </div>
                <div class="driver-settlement-stats">
                    <div>
                        <div style="font-size: 0.75rem; color: #64748b;">الطلبات بعهدته:</div>
                        <div style="font-size: 0.85rem; font-weight: 700; color: #0284c7;">${orderIdsText}</div>
                    </div>
                    <div style="text-align: left;">
                        <div style="font-size: 0.75rem; color: #64748b;">النقدية المطلوب توريدها:</div>
                        <div class="driver-stat-val" style="color: #16a34a;">${d.totalCash.toFixed(2)} ${state.settings.currency}</div>
                    </div>
                </div>
                <button type="button" class="btn-settle-driver" onclick="settleDriverOrders('${escapeHtml(d.name)}')">
                    <i class="fas fa-hand-holding-usd"></i>
                    <span>تقفيل واستلام النقدية (${d.totalCash.toFixed(2)} ${state.settings.currency})</span>
                </button>
            </div>
        `;
    });

    grid.innerHTML = html;
}

function renderActiveDeliveryOrders(activeOrders) {
    const list = document.getElementById('hub-active-orders-list');
    if (!list) return;

    if (activeOrders.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 30px; color: #94a3b8;">لا توجد طلبات توصيل جارية حالياً</div>`;
        return;
    }

    let html = '';
    activeOrders.forEach(ord => {
        const items = normalizeOrderItems(ord.items);
        const itemsText = items.map(i => `${i.name} × ${i.quantity}`).join('، ');
        html += `
            <div class="hub-order-card">
                <div style="flex: 1; min-width: 250px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
                        <span style="font-weight: 800; font-size: 0.95rem; color: #0f172a;">طلب #${ord.id}</span>
                        <span style="font-size: 0.72rem; background: #e0f2fe; color: #0369a1; padding: 2px 7px; border-radius: 4px; font-weight: 700;"><i class="fas fa-motorcycle"></i> ${escapeHtml(ord.delivery_driver || 'بدون سائق')}</span>
                        <span style="font-size: 0.72rem; color: #64748b;">${ord.created_at || ''}</span>
                    </div>
                    <div style="font-size: 0.85rem; font-weight: 700; color: #334155;">
                        <i class="fas fa-user"></i> ${escapeHtml(ord.customer_name || 'عميل توصيل')} 
                        ${ord.customer_phone ? `• <a href="tel:${escapeHtml(ord.customer_phone)}" style="color: #0284c7; text-decoration: none;"><i class="fas fa-phone"></i> ${escapeHtml(ord.customer_phone)}</a>` : ''}
                    </div>
                    <div style="font-size: 0.78rem; color: #64748b; margin-top: 3px;">
                        <i class="fas fa-map-marker-alt" style="color: #ef4444;"></i> ${escapeHtml(ord.customer_address || 'العنوان غير مسجل')}
                    </div>
                    <div style="font-size: 0.75rem; color: #475569; margin-top: 4px; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">
                        ${itemsText}
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                    <div style="font-size: 1.1rem; font-weight: 800; color: #16a34a;">
                        ${Number(ord.total_price).toFixed(2)} ${state.settings.currency}
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
                        <button type="button" class="btn-icon-text" style="padding: 6px 10px; font-size: 0.8rem;" onclick="triggerPrint(${JSON.stringify(ord).replace(/"/g, '&quot;')})" title="طباعة بون التوصيل">
                            <i class="fas fa-print"></i> بون
                        </button>
                        <button type="button" class="btn-return-order" onclick="openReturnDeliveryModal('${ord.id}')" title="تسجيل إرجاع الأوردر وإسقاطه من عهدة الطيار">
                            <i class="fas fa-undo"></i> ترجيع
                        </button>
                        <button type="button" class="btn-delete-order" onclick="deleteDeliveryOrder('${ord.id}')" title="حذف طلب التوصيل نهائياً">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button type="button" class="btn-checkout" style="padding: 6px 14px; font-size: 0.82rem; background: linear-gradient(135deg, #059669, #10b981);" onclick="settleSingleDeliveryOrder('${ord.id}')" title="استلام النقدية وتقفيل الطلب كمسلم">
                            <i class="fas fa-check"></i> تقفيل وتسليم
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    list.innerHTML = html;
}

function renderSettledDeliveryOrders(settledOrders) {
    const list = document.getElementById('hub-settled-orders-list');
    if (!list) return;

    if (settledOrders.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 25px; color: #94a3b8;">لم يتم تقفيل أي طلبات اليوم بعد</div>`;
        return;
    }

    let html = '';
    settledOrders.slice(0, 25).forEach(ord => {
        html += `
            <div class="hub-order-card settled">
                <div>
                    <span style="font-weight: 800; color: #0f172a;">طلب #${ord.id}</span>
                    <span style="font-size: 0.75rem; color: #64748b; margin-right: 8px;">العميل: ${escapeHtml(ord.customer_name)}</span>
                    <span style="font-size: 0.75rem; color: #059669; margin-right: 8px;"><i class="fas fa-check-circle"></i> سُلّم بواسطة: ${escapeHtml(ord.delivery_driver || '-')}</span>
                </div>
                <div style="font-weight: 800; color: #059669;">
                    تم التحصيل: ${Number(ord.total_price).toFixed(2)} ${state.settings.currency}
                </div>
            </div>
        `;
    });

    list.innerHTML = html;
}

function renderReturnedDeliveryOrders(returnedOrders) {
    const list = document.getElementById('hub-returned-orders-list');
    if (!list) return;

    if (!returnedOrders || returnedOrders.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 25px; color: #94a3b8;">لا توجد أي طلبات مرتجعة اليوم</div>`;
        return;
    }

    let html = '';
    returnedOrders.forEach(ord => {
        html += `
            <div class="hub-order-card returned">
                <div style="flex: 1; min-width: 250px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px; flex-wrap: wrap;">
                        <span style="font-weight: 800; color: #991b1b;">طلب #${ord.id} (مرتجع)</span>
                        <span style="font-size: 0.72rem; background: #fee2e2; color: #991b1b; padding: 2px 7px; border-radius: 4px; font-weight: 700;">
                            <i class="fas fa-motorcycle"></i> ${escapeHtml(ord.delivery_driver || '-')}
                        </span>
                        <span style="font-size: 0.72rem; color: #64748b;">${ord.returned_at || ord.created_at || ''}</span>
                    </div>
                    <div style="font-size: 0.82rem; color: #334155;">
                        <strong>العميل:</strong> ${escapeHtml(ord.customer_name || '-')} 
                        ${ord.customer_phone ? `(${escapeHtml(ord.customer_phone)})` : ''}
                    </div>
                    <div style="font-size: 0.78rem; color: #b91c1c; margin-top: 3px; font-weight: 700;">
                        <i class="fas fa-exclamation-circle"></i> سبب الإرجاع: ${escapeHtml(ord.return_reason || 'غير محدد')}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                    <div style="font-weight: 800; color: #991b1b; font-size: 1rem;">
                        ${Number(ord.total_price || 0).toFixed(2)} ${state.settings.currency}
                    </div>
                    <button type="button" class="btn-delete-order" onclick="deleteDeliveryOrder('${ord.id}')" title="حذف الطلب نهائياً">
                        <i class="fas fa-trash"></i> حذف
                    </button>
                </div>
            </div>
        `;
    });

    list.innerHTML = html;
}

function openReturnDeliveryModal(orderId) {
    const input = document.getElementById('return-delivery-order-id');
    if (input) input.value = orderId;
    const select = document.getElementById('return-reason-select');
    if (select) select.value = 'العميل رفض الاستلام';
    const customGroup = document.getElementById('return-reason-custom-group');
    if (customGroup) customGroup.style.display = 'none';
    const customInput = document.getElementById('return-reason-custom');
    if (customInput) customInput.value = '';
    openModal('delivery-return-modal');
}

function handleReturnReasonChange(val) {
    const customGroup = document.getElementById('return-reason-custom-group');
    if (customGroup) {
        customGroup.style.display = (val === 'other') ? 'block' : 'none';
    }
}

function confirmReturnDeliveryOrder() {
    const orderId = document.getElementById('return-delivery-order-id')?.value;
    const ord = (state.deliveryOrders || []).find(o => String(o.id) === String(orderId));
    if (!ord) return;

    const select = document.getElementById('return-reason-select');
    let reason = select ? select.value : 'العميل رفض الاستلام';
    if (reason === 'other') {
        const customVal = document.getElementById('return-reason-custom')?.value.trim();
        reason = customVal || 'سبب آخر غير محدد';
    }

    ord.status = 'returned';
    ord.returned_at = new Date().toLocaleTimeString('ar-SA');
    ord.return_reason = reason;

    saveDeliveryOrders();
    renderDeliveryHub();
    closeModal('delivery-return-modal');
    showToast(`↩️ تم تسجيل إرجاع طلب التوصيل #${orderId} وإسقاط قيمته من عهدة الطيار`, 'warning');
}

function deleteDeliveryOrder(orderId) {
    if (!confirm(`هل أنت متأكد من حذف وإلغاء طلب التوصيل #${orderId} نهائياً؟`)) {
        return;
    }

    state.deliveryOrders = (state.deliveryOrders || []).filter(o => String(o.id) !== String(orderId));
    saveDeliveryOrders();
    renderDeliveryHub();
    showToast(`🗑️ تم حذف طلب التوصيل #${orderId} بنجاح`, 'info');
}

function settleDriverOrders(driverName) {
    const driverOrders = (state.deliveryOrders || []).filter(o => o.status === 'out_for_delivery' && (o.delivery_driver || 'غير محدد') === driverName);
    if (driverOrders.length === 0) return;

    const totalCash = driverOrders
        .filter(o => (o.payment_method || 'cash') === 'cash')
        .reduce((sum, o) => sum + Number(o.total_price || 0), 0);

    if (!confirm(`هل استلمت النقدية كاملة (${totalCash.toFixed(2)} ${state.settings.currency}) من الطيار "${driverName}" وتريد تقفيل حسابه وتسوية ${driverOrders.length} طلبات؟`)) {
        return;
    }

    const now = new Date().toLocaleTimeString('ar-SA');
    driverOrders.forEach(o => {
        o.status = 'settled';
        o.settled_at = now;
    });

    saveDeliveryOrders();
    renderDeliveryHub();
    showToast(`🎉 تم استلام النقدية (${totalCash.toFixed(2)} ${state.settings.currency}) وتقفيل عهدة الطيار "${driverName}" بنجاح!`, 'success');
}

function settleSingleDeliveryOrder(orderId) {
    const ord = (state.deliveryOrders || []).find(o => String(o.id) === String(orderId));
    if (!ord) return;

    ord.status = 'settled';
    ord.settled_at = new Date().toLocaleTimeString('ar-SA');

    saveDeliveryOrders();
    renderDeliveryHub();
    showToast(`✅ تم تقفيل وتسليم طلب التوصيل #${orderId} بنجاح!`, 'success');
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
    const deliveryFeeCalc = Number(order.delivery_fee || 0);
    const taxRate = Number(state.settings.taxPercent || 0);
    const taxableBase = subtotalCalc + tableServiceFee + cardFee + deliveryFeeCalc;
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
            
            ${(order.table_number || order.customer_name || order.customer_phone || order.customer_address || order.delivery_driver) ? `
            <div class="customer-box">
                ${order.table_number ? `<p><strong>الطاولة:</strong> ${escapeHtml(order.table_number)}</p>` : ''}
                ${order.customer_name ? `<p><strong>العميل:</strong> ${escapeHtml(order.customer_name)}</p>` : ''}
                ${order.customer_phone ? `<p><strong>الهاتف:</strong> ${escapeHtml(order.customer_phone)}</p>` : ''}
                ${order.customer_address ? `<p><strong>العنوان:</strong> ${escapeHtml(order.customer_address)}</p>` : ''}
                ${order.delivery_driver ? `<p><strong>سائق التوصيل:</strong> ${escapeHtml(order.delivery_driver)}</p>` : ''}
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
                ${deliveryFeeCalc > 0 ? `
                <div class="total-row"><span>خدمة التوصيل (الدليفري):</span><span>+${deliveryFeeCalc.toFixed(2)}</span></div>
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
            // إرسال الطلب الوارد فوراً لشاشة المطبخ KDS
            addOrderToKitchen(order);
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

    // 1. نموذج إضافة أو تعديل طاولة
    document.getElementById('add-table-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('input-edit-table-id')?.value;
        const name = document.getElementById('input-new-table-name').value.trim();
        const seats = parseInt(document.getElementById('input-new-table-seats').value) || 4;
        const zone = document.getElementById('input-new-table-zone')?.value || 'indoor';
        const notes = document.getElementById('input-new-table-notes').value.trim();

        if (editId) {
            const table = state.tables.find(t => String(t.id) === String(editId));
            if (table) {
                table.name = name;
                table.seats = seats;
                table.zone = zone;
                table.notes = notes;
            }
            saveTables();
            renderTables();
            closeModal('add-table-modal');
            showToast(`تم تعديل بيانات ${name} بنجاح!`, 'success');
            document.getElementById('input-edit-table-id').value = '';
            document.getElementById('add-table-modal-title').innerHTML = '<i class="fas fa-chair"></i> إضافة طاولة جديدة';
            e.target.reset();
            return;
        }

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
        populateDeliveryDriversDropdown();
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
    removeTenantStorage('codeart_pos_settings');
    removeTenantStorage('codeart_pos_tables');
    removeTenantStorage('codeart_pos_employees');
    removeTenantStorage('codeart_pos_payroll');
    removeTenantStorage('codeart_pos_expenses');
    removeTenantStorage('codeart_pos_orders_history');
    removeTenantStorage('codeart_pos_menu_cache');
    removeTenantStorage('codeart_pos_kitchen_orders');
    removeTenantStorage('codeart_pos_customers');
    removeTenantStorage('codeart_pos_delivery_orders');
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

// دوال نظام التوصيل والدليفري وتقفيل الحسابات (Delivery & Settlement)
window.openDeliveryDetailsModal = openDeliveryDetailsModal;
window.saveDeliveryModalData = saveDeliveryModalData;
window.handleCustomerPhoneInput = handleCustomerPhoneInput;
window.handleDeliveryDriverSelect = handleDeliveryDriverSelect;
window.setDeliveryFeeQuick = setDeliveryFeeQuick;
window.openDeliveryHubModal = openDeliveryHubModal;
window.switchDeliveryHubTab = switchDeliveryHubTab;
window.renderDeliveryHub = renderDeliveryHub;
window.settleDriverOrders = settleDriverOrders;
window.settleSingleDeliveryOrder = settleSingleDeliveryOrder;
window.openReturnDeliveryModal = openReturnDeliveryModal;
window.handleReturnReasonChange = handleReturnReasonChange;
window.confirmReturnDeliveryOrder = confirmReturnDeliveryOrder;
window.deleteDeliveryOrder = deleteDeliveryOrder;
window.renderReturnedDeliveryOrders = renderReturnedDeliveryOrders;
window.updateDeliveryBadge = updateDeliveryBadge;

// دوال إدارة وإجراءات الطاولات التفاعلية (Interactive Tables & Actions)
window.openTableActionModal = openTableActionModal;
window.handleTamAddItems = handleTamAddItems;
window.handleTamCheckout = handleTamCheckout;
window.handleTamShowTransfer = handleTamShowTransfer;
window.handleTamConfirmTransfer = handleTamConfirmTransfer;
window.handleTamClearTable = handleTamClearTable;
window.handleTamNewOrder = handleTamNewOrder;
window.handleTamEditTable = handleTamEditTable;
window.handleTamDeleteTable = handleTamDeleteTable;
window.transferTable = transferTable;
window.openEditTableModal = openEditTableModal;

// دوال إدارة وتخصيص وتوليد روابط المطاعم المتعددة (Multi-Store Onboarding & Sync)
window.copyStoreShareLink = copyStoreShareLink;
window.shareStoreWhatsApp = shareStoreWhatsApp;
window.saveStoreSlugChange = saveStoreSlugChange;
window.getStoreShareUrl = getStoreShareUrl;
window.openStoreDetailsModal = openStoreDetailsModal;
window.openRestaurantOnboardingModal = openRestaurantOnboardingModal;
window.autoGenerateStoreSlug = autoGenerateStoreSlug;
window.updateOnboardSlugPreview = updateOnboardSlugPreview;
window.submitRestaurantOnboarding = submitRestaurantOnboarding;
window.broadcastPosEvent = broadcastPosEvent;
