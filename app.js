// ==========================================================================
// [FIREBASE INITIALIZATION] การตั้งค่าและเชื่อมต่อ Firebase, Auth & Firestore
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAdXhdFIURRCZX_6ozynr0Ij16KoRAFkts",
  authDomain: "orivexa.firebaseapp.com",
  projectId: "orivexa",
  storageBucket: "orivexa.firebasestorage.app",
  messagingSenderId: "661750654974",
  appId: "1:661750654974:web:2c8b896be65d2d96a6c2af",
  measurementId: "G-H3D0ZBHEFB"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ==========================================================================
// [SECTION 1: DATA SETUP & STORAGE SYNC] การดึงและซิงค์ฐานข้อมูลหลักผ่าน Firebase Firestore
// ==========================================================================
let siteBanner = {
    url: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?q=80&w=1200",
    title: "Welcome to Orivexa",
    subtitle: "เครื่องสำอางและแฟชั่นสำหรับผู้หญิงยุคใหม่"
};

let categories = [];
let products = [];

function loadAllData() {
    db.collection("settings").doc("banner").onSnapshot((doc) => {
        if (doc.exists) {
            siteBanner = doc.data();
        } else {
            db.collection("settings").doc("banner").set(siteBanner);
        }
        renderBanner();
    });

    // ดึงข้อมูลหมวดหมู่ (พร้อมตัวดักจับป้องกันข้อมูลอาร์เรย์แบบเก่าชนกับ Object ใหม่)
    db.collection("categories").orderBy("orderIndex", "asc").onSnapshot((snapshot) => {
        if (!snapshot.empty) {
            categories = snapshot.docs.map(doc => {
                const data = doc.data();
                // 🛠️ จุดแก้ไขสำคัญป้องกันบัค "• 0": หากฐานข้อมูลเดิมเป็น Array ให้แปลงเป็นโครงสร้าง Object อัตโนมัติ
                if (Array.isArray(data.sub)) {
                    let newSubObj = {};
                    data.sub.forEach(subName => {
                        if(subName !== "0" && subName !== 0) {
                            newSubObj[subName] = [];
                        }
                    });
                    data.sub = newSubObj;
                }
                return { id: doc.id, ...data };
            });
        } else {
            // โครงสร้างมาตรฐานแบบใหม่แบบ Object รองรับ 3 ชั้นลึกสุด
            const defaultCats = [
                { name: "เครื่องสำอาง", type: "main", sub: { "แป้ง": ["แป้งพัฟ", "แป้งฝุ่น"], "ลิปสติก": [] }, orderIndex: 0 },
                { name: "แฟชั่น", type: "main", sub: { "เสื้อ": [], "กางเกง": [] }, orderIndex: 1 }
            ];
            defaultCats.forEach((cat, index) => {
                db.collection("categories").doc('cat-' + (Date.now() + index)).set(cat);
            });
            categories = defaultCats;
        }
        renderCategories();
        setupAdminCategorySelects();
        renderProducts();
    });

    db.collection("products").orderBy("orderIndex", "asc").onSnapshot((snapshot) => {
        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProducts();
    });
}

// ==========================================================================
// [SECTION 2: STATE VARIABLES] ตัวแปรคุมสถานะการทำงานของระบบ
// ==========================================================================
let isAdminLoggedIn = false;     
let currentFilter = "all";       
let currentFilterType = "all";   // 'all', 'sub', 'child'
let searchKeyword = "";          
let editingProductId = null;     
let currentSortRule = "default"; 
let gridSortableInstance = null; 

// ==========================================================================
// [SECTION 3: DOM ELEMENTS & APP INIT] ตัวจับปุ่ม/ฟอร์ม และสั่งให้ระบบเริ่มทำงาน
// ==========================================================================
const adminBtn = document.getElementById('adminBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginModal = document.getElementById('loginModal');
const closeLoginBtn = document.getElementById('closeLoginBtn');
const submitLoginBtn = document.getElementById('submitLoginBtn');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');
const adminPanel = document.getElementById('adminPanel');
const saveOrderBtn = document.getElementById('saveOrderBtn');

document.addEventListener("DOMContentLoaded", () => {
    loadAllData();       
    setupSortDropdown(); 
    setupAdminForms();   
    setupLoginEnterKey(); 
    setupProductGridOrderSave(); 
    
    auth.onAuthStateChanged((user) => {
        if (user) {
            handleAdminLoginSuccess();
        } else {
            handleAdminLogoutSuccess();
        }
    });
});

// ==========================================================================
// [SECTION 4: FRONTEND RENDER LOGIC] ส่วนการดึงข้อมูลไปวาดแสดงผลหน้าร้านค้า
// ==========================================================================
function renderBanner() {
    const bannerImg = document.getElementById('heroImage');
    if (bannerImg) {
        bannerImg.src = siteBanner.url;
    } else {
        document.getElementById('heroSection').style.backgroundImage = `url('${siteBanner.url}')`;
    }
    document.getElementById('heroTitle').innerText = siteBanner.title;
    document.getElementById('heroSubtitle').innerText = siteBanner.subtitle;
}

function calculateDiscountPrice(originalPrice, discountCode) {
    const roundedOriginalPrice = Math.ceil(originalPrice);
    if (!discountCode || !discountCode.includes('=')) {
        return { finalPrice: roundedOriginalPrice, hasDiscount: false, savings: 0 };
    }
    try {
        const parts = discountCode.split('=');
        const percent = parseFloat(parts[0].replace('%', '')); 
        const maxCap = parseFloat(parts[1]);                  
        let calculatedSavings = roundedOriginalPrice * (percent / 100); 
        if (calculatedSavings > maxCap) calculatedSavings = maxCap;
        let finalPrice = Math.ceil(roundedOriginalPrice - calculatedSavings);
        return { finalPrice: Math.max(0, finalPrice), hasDiscount: calculatedSavings > 0, savings: calculatedSavings };
    } catch (e) {
        return { finalPrice: roundedOriginalPrice, hasDiscount: false, savings: 0 };
    }
}

function setupSortDropdown() {
    const sortSelect = document.getElementById('productSortSelect');
    if (!sortSelect) return;
    sortSelect.addEventListener('change', (e) => {
        currentSortRule = e.target.value;
        renderProducts(); 
    });
}

function renderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    grid.innerHTML = "";

    let filtered = products.filter(p => {
        let matchesCategory = false;
        if (currentFilter === "all") {
            matchesCategory = true;
        } else if (currentFilterType === "sub") {
            matchesCategory = (p.subCategory === currentFilter);
        } else if (currentFilterType === "child") {
            matchesCategory = (p.childCategory === currentFilter);
        }

        const cleanQuery = searchKeyword.toLowerCase().trim();
        const matchesName = p.name ? p.name.toLowerCase().includes(cleanQuery) : false;
        const productKeywordsStr = p.keywords ? p.keywords.toLowerCase() : "";
        const matchesKeywords = productKeywordsStr.includes(cleanQuery);
        return matchesCategory && (matchesName || matchesKeywords);
    });

    if (currentSortRule === "price-asc") {
        filtered.sort((a, b) => calculateDiscountPrice(a.price, a.discountCode).finalPrice - calculateDiscountPrice(b.price, b.discountCode).finalPrice);
    } else if (currentSortRule === "price-desc") {
        filtered.sort((a, b) => calculateDiscountPrice(b.price, b.discountCode).finalPrice - calculateDiscountPrice(a.price, a.discountCode).finalPrice);
    } else if (currentSortRule === "default") {
        filtered.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    }

    document.getElementById('productCount').innerText = `${filtered.length} รายการ`;

    if(filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-gray-400 text-sm">ไม่พบสินค้าที่คุณค้นหา</div>`;
        destroyGridSortable();
        return;
    }

    filtered.forEach(p => {
        const discInfo = calculateDiscountPrice(p.price, p.discountCode);
        let shopeeButtonsHTML = "";
        if (p.shopee1 && !p.shopee2) {
            shopeeButtonsHTML = `<a href="${p.shopee1}" target="_blank" class="w-full text-center bg-[#EE4D2D] text-white hover:bg-[#D43F21] py-1.5 rounded-lg font-bold text-xs block transition"><i class="fa-solid fa-bag-shopping mr-1"></i> Shopee</a>`;
        } else if (p.shopee1 && p.shopee2) {
            shopeeButtonsHTML = `
                <div class="grid grid-cols-2 gap-1 w-full">
                    <a href="${p.shopee1}" target="_blank" class="text-center bg-[#EE4D2D] text-white hover:bg-[#D43F21] py-1.5 rounded-lg font-bold text-[11px] block transition text-ellipsis overflow-hidden whitespace-nowrap">Shopee 1</a>
                    <a href="${p.shopee2}" target="_blank" class="text-center bg-[#EE4D2D] text-white hover:bg-[#D43F21] py-1.5 rounded-lg font-bold text-[11px] block transition text-ellipsis overflow-hidden whitespace-nowrap">Shopee 2</a>
                </div>
            `;
        }

        let adminControls = "";
        let dragHandleHTML = "";
        if(isAdminLoggedIn) {
            dragHandleHTML = `
                <div class="absolute top-2 left-2 bg-black/60 text-white w-7 h-7 rounded-full text-xs shadow cursor-grab active:cursor-grabbing flex items-center justify-center z-20 main-grid-handle">
                    <i class="fa-solid fa-up-down-left-right text-[10px]"></i>
                </div>
            `;
            adminControls = `
                <div class="absolute top-2 right-2 flex space-x-1 z-20">
                    <button onclick="editProduct('${p.id}')" class="bg-amber-500 text-white w-7 h-7 rounded-full text-xs shadow hover:bg-amber-600 transition flex items-center justify-center"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button onclick="deleteProduct('${p.id}')" class="bg-red-500 text-white w-7 h-7 rounded-full text-xs shadow hover:bg-red-600 transition flex items-center justify-center"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
        }

        const card = document.createElement('div');
        card.className = "product-card bg-white rounded-2xl overflow-hidden border border-[#F0EAE5] shadow-sm hover:shadow-md transition relative flex flex-col justify-between";
        card.setAttribute('data-product-id', p.id);
        
        const breadcrumbText = p.childCategory ? `${p.subCategory} ➔ ${p.childCategory}` : p.subCategory;

        card.innerHTML = `
            ${dragHandleHTML}
            ${adminControls}
            <div>
                <div class="aspect-square w-full overflow-hidden bg-gray-100 relative">
                    <img src="${p.img || 'https://via.placeholder.com/400'}" class="w-full h-full object-cover shadow-inner">
                    ${discInfo.hasDiscount ? `<span class="absolute bottom-2 left-2 bg-[#EE4D2D] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">ลดพิเศษ</span>` : ''}
                </div>
                <div class="p-3">
                    <p class="text-[10px] text-amber-600 font-medium mb-1 truncate"># ${breadcrumbText}</p>
                    <h4 class="font-medium text-xs md:text-sm text-[#4A4A4A] line-clamp-2 h-8 md:h-10 mb-2">${p.name}</h4>
                </div>
            </div>
            <div class="p-3 pt-0">
                <div class="flex items-baseline space-x-1.5 mb-3">
                    <span class="text-sm md:text-base font-bold text-[#EE4D2D]">฿${discInfo.finalPrice.toLocaleString()}</span>
                    ${discInfo.hasDiscount ? `<span class="text-[10px] md:text-xs text-gray-400 line-through">฿${Math.ceil(p.price).toLocaleString()}</span>` : ''}
                </div>
                ${shopeeButtonsHTML}
            </div>
        `;
        grid.appendChild(card);
    });

    initGridSortable();
}

// ==========================================================================
// [ADDED FUNCTIONS] ระบบเปิด-ปิดสลับการแสดงผล และ Smooth Scroll ไปที่กลุ่มสินค้า
// ==========================================================================

// ฟังก์ชันเปิด-ปิดสลับโหมดเมนู (สลับระหว่าง "แถวเดียวนอนสไลด์" กับ "ขยายแผ่ออกมาทั้งหมด")
function toggleMobileMenu() {
    const menu = document.getElementById('categoryMenu');
    const btnText = document.getElementById('toggleBtnText');
    if (!menu || !btnText) return;

    // ตรวจสอบว่าปัจจุบันล็อกบรรทัดเดียว (whitespace-nowrap) อยู่หรือไม่
    if (menu.classList.contains('whitespace-nowrap')) {
        // ➔ ถ้าล็อกอยู่: ปลดล็อกออกเพื่อให้ปุ่มไหลลงมาเรียงกันหลายบรรทัด เห็นครบทุกหมวดหมู่
        menu.classList.remove('whitespace-nowrap', 'overflow-x-auto');
        menu.classList.add('flex-wrap');
        btnText.innerText = "พับเก็บเมนู";
    } else {
        // ➔ ถ้าขยายอยู่: สลับกลับไปล็อกเป็นแถวเดียวนอนปัดสไลด์ขวาเหมือนเดิม
        menu.classList.add('whitespace-nowrap', 'overflow-x-auto');
        menu.classList.remove('flex-wrap');
        btnText.innerText = "ดูหมวดหมู่ทั้งหมด";
    }
}

// ฟังก์ชัน Action เมื่อกดเลือกหมวดหมู่: กรองสินค้า ➔ พับเมนูกลับเป็นแนวนอนบรรทัดเดียว ➔ เลื่อนจอโฟกัสสินค้า
function selectCategoryFilter(filterName, filterType) {
    currentFilter = filterName;
    currentFilterType = filterType;
    
    // 1. อัปเดต UI ไฮไลต์ปุ่ม และแสดงสินค้าที่ตรงตัวกรอง
    updateActiveCategoryUI();
    renderProducts();
    
    // 2. หากเปิดบนจอมือถือและเมนูกำลังแผ่ขยายอยู่ ให้สั่งพับกลับเป็นแถวนอนบรรทัดเดียวทันที
    const menu = document.getElementById('categoryMenu');
    if (window.innerWidth < 768 && menu && menu.classList.contains('flex-wrap')) {
        toggleMobileMenu();
    }
    
    // 3. เลื่อนหน้าจอ (Smooth Scroll) ดึงลงมาที่หัวข้อโซนสินค้า เพื่อให้ลูกค้าพร้อมช้อปทันที
    const productZone = document.getElementById('currentCategoryTitle');
    if (productZone) {
        productZone.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ==========================================================================
// [UPDATED FUNCTION] ฟังก์ชันสร้างเมนูหมวดหมู่ (วางทับแทนที่อันเดิมได้เลย)
// ==========================================================================
function renderCategories() {
    const menuContainer = document.getElementById('categoryMenu');
    const adminCatList = document.getElementById('adminCategoryList');
    if(!menuContainer || !adminCatList) return; 

    menuContainer.innerHTML = "";
    adminCatList.innerHTML = "";

    // 🌟 ปุ่มสินค้าทั้งหมด
    const allBtn = document.createElement('button');
    // เพิ่ม flex-shrink-0 เพื่อไม่ให้ปุ่มโดนบีบขนาดในแถวนอน
    allBtn.className = `px-3 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-xl whitespace-nowrap text-left transition flex-shrink-0 ${currentFilter === 'all' ? 'bg-[#D4A373] text-white font-bold' : 'bg-[#FAF7F5] text-gray-600 hover:bg-gray-100'}`;
    allBtn.innerText = "🌟 สินค้าทั้งหมด";
    allBtn.onclick = () => selectCategoryFilter("all", "all");
    menuContainer.appendChild(allBtn);

    categories.forEach((mainCat, mainIdx) => {
        // หัวข้อหมวดหมู่หลัก (แสดงบน PC ปกติ แต่บนมือถือจะซ่อนในโหมดแถวนอนเพื่อให้สไลด์ง่ายไม่สะดุดขัดตา)
        const mainTitle = document.createElement('div');
        mainTitle.className = "text-[11px] uppercase font-bold tracking-wider text-amber-800 mt-4 mb-1 pl-2 hidden md:block flex-shrink-0";
        mainTitle.innerText = mainCat.name;
        menuContainer.appendChild(mainTitle);

        const adminMainRow = document.createElement('div');
        adminMainRow.className = "bg-amber-50 p-2 rounded-xl border border-amber-200 flex items-center justify-between text-xs mt-2";
        adminMainRow.innerHTML = `
            <div class="font-bold text-[#4A4A4A]">${mainCat.name} <span class="text-[9px] text-amber-600">(หลัก)</span></div>
            <div class="flex items-center space-x-1.5">
                <button onclick="moveCategory(${mainIdx}, 'up')" class="text-gray-400 hover:text-black"><i class="fa-solid fa-arrow-up"></i></button>
                <button onclick="moveCategory(${mainIdx}, 'down')" class="text-gray-400 hover:text-black"><i class="fa-solid fa-arrow-down"></i></button>
                <button onclick="editCategoryName('${mainCat.id}', 'main')" class="text-blue-500 hover:text-blue-700 mx-1"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteCategory('${mainCat.id}', 'main')" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;
        adminCatList.appendChild(adminMainRow);

        const subs = mainCat.sub || {};
        Object.keys(subs).forEach((subCatName) => {
            if(subCatName === "0") return; // ข้ามค่าขยะ

            // ▪ หมวดหมู่ย่อยชั้นที่ 1
            const subBtn = document.createElement('button');
            subBtn.className = `px-3 py-1.5 md:py-2 md:pl-4 text-xs rounded-xl whitespace-nowrap text-left transition flex-shrink-0 ${currentFilter === subCatName && currentFilterType === "sub" ? 'bg-[#EAE2B7] text-[#4A4A4A] font-bold shadow-sm' : 'bg-[#FAF7F5] text-gray-600 hover:bg-gray-100'}`;
            subBtn.innerText = `▪ ${subCatName}`;
            subBtn.onclick = () => selectCategoryFilter(subCatName, "sub");
            menuContainer.appendChild(subBtn);

            const adminSubRow = document.createElement('div');
            adminSubRow.className = "bg-white p-1.5 pl-4 border-b flex items-center justify-between text-xs";
            adminSubRow.innerHTML = `
                <div class="text-gray-700 font-medium">➔ ${subCatName}</div>
                <div class="flex items-center space-x-1.5">
                    <button onclick="editCategoryName('${mainCat.id}', 'sub', '${subCatName}')" class="text-blue-400 hover:text-blue-600"><i class="fa-solid fa-pen text-[10px]"></i></button>
                    <button onclick="deleteCategory('${mainCat.id}', 'sub', '${subCatName}')" class="text-red-400 hover:text-red-500"><i class="fa-solid fa-trash text-[10px]"></i></button>
                </div>
            `;
            adminCatList.appendChild(adminSubRow);

            const childList = subs[subCatName] || [];
            childList.forEach((childCatName) => {
                // └ หมวดหมู่ย่อยชั้นที่ 2
                const childBtn = document.createElement('button');
                childBtn.className = `px-3 py-1.5 md:py-1 md:pl-7 text-[11px] rounded-lg whitespace-nowrap text-left transition flex-shrink-0 ${currentFilter === childCatName && currentFilterType === "child" ? 'bg-amber-100 text-amber-900 font-bold' : 'text-gray-500 hover:bg-gray-100'}`;
                childBtn.innerText = `└ ${childCatName}`;
                childBtn.onclick = () => selectCategoryFilter(childCatName, "child");
                menuContainer.appendChild(childBtn);

                const adminChildRow = document.createElement('div');
                adminChildRow.className = "bg-gray-50 p-1 pl-8 text-[11px] border-b border-dashed flex items-center justify-between text-gray-400";
                adminChildRow.innerHTML = `
                    <div>└─ ${childCatName}</div>
                    <button onclick="deleteChildCategory('${mainCat.id}', '${subCatName}', '${childCatName}')" class="text-gray-400 hover:text-red-500 p-0.5"><i class="fa-solid fa-xmark"></i></button>
                `;
                adminCatList.appendChild(adminChildRow);
            });
        });
    });
}

function updateActiveCategoryUI() {
    document.getElementById('currentCategoryTitle').innerText = currentFilter === 'all' ? 'สินค้าทั้งหมด' : `หมวดหมู่: ${currentFilter}`;
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    searchKeyword = e.target.value;
    renderProducts();
});

// ==========================================================================
// [SECTION 5: ADMIN AUTHENTICATION]
// ==========================================================================
adminBtn.addEventListener('click', () => { loginModal.classList.remove('hidden'); usernameInput.focus(); });
closeLoginBtn.addEventListener('click', () => { loginModal.classList.add('hidden'); loginError.classList.add('hidden'); });

function executeLogin() {
    const email = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) { return; }
    auth.signInWithEmailAndPassword(email, password)
        .then(() => { loginModal.classList.add('hidden'); })
        .catch(() => { loginError.classList.remove('hidden'); });
}

submitLoginBtn.addEventListener('click', executeLogin);

function handleAdminLoginSuccess() {
    isAdminLoggedIn = true;
    adminPanel.classList.remove('hidden'); 
    logoutBtn.classList.remove('hidden');   
    adminBtn.classList.add('hidden');      
    saveOrderBtn.style.display = 'flex';
    document.getElementById('editHeroUrl').value = siteBanner.url || "";
    document.getElementById('editHeroTitle').value = siteBanner.title || "";
    document.getElementById('editHeroSub').value = siteBanner.subtitle || "";
    injectAdminShortcutMenu();
    renderProducts(); 
    renderCategories();
}

function setupLoginEnterKey() {
    const handleEnter = (event) => { if (event.key === "Enter") { executeLogin(); } };
    usernameInput.addEventListener('keydown', handleEnter);
    passwordInput.addEventListener('keydown', handleEnter);
}

function injectAdminShortcutMenu() {
    let oldShortcut = document.getElementById('adminShortcutBar');
    if(oldShortcut) oldShortcut.remove();
    const shortcutDiv = document.createElement('div');
    shortcutDiv.id = "adminShortcutBar";
    shortcutDiv.className = "bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-6 flex flex-wrap gap-2 items-center text-xs";
    shortcutDiv.innerHTML = `<span class="font-bold text-amber-800"><i class="fa-solid fa-toolbox mr-1"></i> ระบบจัดการแบบ 3 ระดับ Active (หลัก > ย่อยชั้น 1 > ย่อยชั้น 2)</span>`;
    adminPanel.insertBefore(shortcutDiv, adminPanel.firstChild);
}

logoutBtn.addEventListener('click', () => { auth.signOut().then(() => { handleAdminLogoutSuccess(); }); });

function handleAdminLogoutSuccess() {
    isAdminLoggedIn = false;
    adminPanel.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    adminBtn.classList.remove('hidden');
    saveOrderBtn.style.display = 'none';
    resetProductForm();
    renderProducts(); 
}

// ==========================================================================
// [SECTION 6: ADMIN CONTROL - CATEGORIES & SELECT CONFIGS]
// ==========================================================================
function setupAdminCategorySelects() {
    const catTypeSelect = document.getElementById('catTypeSelect');
    const prodSubCatSelect = document.getElementById('prodSubCatSelect');
    const prodChildCatSelect = document.getElementById('prodChildCatSelect');

    if(!catTypeSelect || !prodSubCatSelect || !prodChildCatSelect) return;

    catTypeSelect.innerHTML = `<option value="main">[+] สร้างเป็นหมวดหมู่หลักใหม่</option>`;
    categories.forEach(c => {
        catTypeSelect.innerHTML += `<option value="sub:${c.id}">+ เพิ่มชั้นที่ 1 (Sub) ใน: ${c.name}</option>`;
        const subs = c.sub || {};
        Object.keys(subs).forEach(subKey => {
            if(subKey !== "0") {
                catTypeSelect.innerHTML += `<option value="child:${c.id}:${subKey}">└─ เพิ่มชั้นที่ 2 (Child) ใน: ${c.name} > ${subKey}</option>`;
            }
        });
    });

    prodSubCatSelect.innerHTML = "";
    categories.forEach(c => {
        const subs = c.sub || {};
        Object.keys(subs).forEach(subKey => {
            if(subKey !== "0") {
                const opt = document.createElement('option');
                opt.value = subKey;
                opt.setAttribute('data-main-id', c.id);
                opt.innerText = `${c.name} ➔ ${subKey}`;
                prodSubCatSelect.appendChild(opt);
            }
        });
    });

    const updateChildDropdown = () => {
        prodChildCatSelect.innerHTML = `<option value="">-- ไม่มีหมวดหมู่ย่อยชั้นที่ 2 --</option>`;
        const selectedSub = prodSubCatSelect.value;
        const selectedOption = prodSubCatSelect.options[prodSubCatSelect.selectedIndex];
        if(!selectedOption) return;
        
        const mainId = selectedOption.getAttribute('data-main-id');
        const mainCat = categories.find(c => c.id === mainId);
        if(mainCat && mainCat.sub && mainCat.sub[selectedSub]) {
            mainCat.sub[selectedSub].forEach(child => {
                prodChildCatSelect.innerHTML += `<option value="${child}">${child}</option>`;
            });
        }
    };

    prodSubCatSelect.onchange = updateChildDropdown;
    updateChildDropdown();
}

document.getElementById('addCatBtn').addEventListener('click', () => {
    const selector = document.getElementById('catTypeSelect').value;
    const name = document.getElementById('newCatName').value.trim();
    if(!name) return alert("กรุณากรอกชื่อหมวดหมู่ด้วยครับ");

    if(selector === "main") {
        const newId = 'cat-' + Date.now();
        db.collection("categories").doc(newId).set({ name: name, type: "main", sub: {}, orderIndex: categories.length });
    } else {
        const parts = selector.split(':');
        const actionType = parts[0];
        const mainId = parts[1];

        const targetMain = categories.find(c => c.id === mainId);
        if(!targetMain) return;

        let currentSubObj = { ...targetMain.sub };

        if(actionType === "sub") {
            if(!currentSubObj[name]) {
                currentSubObj[name] = [];
                db.collection("categories").doc(mainId).update({ sub: currentSubObj });
            } else {
                alert("มีชื่อหมวดหมู่ย่อยนี้อยู่แล้วในกลุ่มหลักนี้");
            }
        } else if(actionType === "child") {
            const subKey = parts[2];
            if(currentSubObj[subKey]) {
                if(!currentSubObj[subKey].includes(name)) {
                    currentSubObj[subKey].push(name);
                    db.collection("categories").doc(mainId).update({ sub: currentSubObj });
                } else {
                    alert("มีชื่อหมวดหมู่ย่อยชั้นที่ 2 นี้อยู่แล้ว");
                }
            }
        }
    }
    document.getElementById('newCatName').value = "";
});

function deleteCategory(mainCatId, type, subKey = null) {
    if(!confirm("คุณมั่นใจไหมที่จะลบหมวดหมู่นี้? ข้อมูลภายในชั้นย่อยทั้งหมดจะหายไป")) return;
    if(type === 'main') { 
        db.collection("categories").doc(mainCatId).delete();
    } else if(type === 'sub' && subKey) { 
        const targetMain = categories.find(c => c.id === mainCatId);
        if(targetMain) {
            let updatedSub = { ...targetMain.sub };
            delete updatedSub[subKey];
            db.collection("categories").doc(mainCatId).update({ sub: updatedSub });
        }
    }
}

function deleteChildCategory(mainCatId, subKey, childName) {
    if(!confirm(`ยืนยันลบหมวดหมู่ย่อยชั้นที่ 2 "${childName}"?`)) return;
    const targetMain = categories.find(c => c.id === mainCatId);
    if(targetMain && targetMain.sub && targetMain.sub[subKey]) {
        let updatedSub = { ...targetMain.sub };
        updatedSub[subKey] = updatedSub[subKey].filter(item => item !== childName);
        db.collection("categories").doc(mainCatId).update({ sub: updatedSub });
    }
}

function editCategoryName(mainCatId, type, oldSubKey = null) {
    const targetMain = categories.find(c => c.id === mainCatId);
    if(!targetMain) return;

    if(type === 'main') {
        const newName = prompt("แก้ไขชื่อหมวดหมู่หลัก:", targetMain.name);
        if(newName && newName.trim() !== "") db.collection("categories").doc(mainCatId).update({ name: newName.trim() });
    } else if(type === 'sub' && oldSubKey) {
        const newName = prompt("แก้ไขชื่อหมวดหมู่ย่อยชั้นที่ 1:", oldSubKey);
        if(newName && newName.trim() !== "" && newName.trim() !== oldSubKey) {
            let updatedSub = { ...targetMain.sub };
            updatedSub[newName.trim()] = updatedSub[oldSubKey]; 
            delete updatedSub[oldSubKey]; 
            db.collection("categories").doc(mainCatId).update({ sub: updatedSub });
        }
    }
}

function moveCategory(index, direction) {
    let targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    const batch = db.batch();
    batch.update(db.collection("categories").doc(categories[index].id), { orderIndex: targetIndex });
    batch.update(db.collection("categories").doc(categories[targetIndex].id), { orderIndex: index });
    batch.commit();
}

document.getElementById('saveHeroBtn').addEventListener('click', () => {
    const updateBanner = {
        url: document.getElementById('editHeroUrl').value,
        title: document.getElementById('editHeroTitle').value,
        subtitle: document.getElementById('editHeroSub').value
    };
    db.collection("settings").doc("banner").set(updateBanner).then(() => alert("อัปเดตหน้าปกสำเร็จ"));
});

// ==========================================================================
// [SECTION 7: ADMIN CONTROL - PRODUCT MGR]
// ==========================================================================
function setupAdminForms() {
    const saveProductBtn = document.getElementById('saveProductBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    saveProductBtn.addEventListener('click', () => {
        const subCat = document.getElementById('prodSubCatSelect').value;
        const childCat = document.getElementById('prodChildCatSelect').value; 
        const name = document.getElementById('prodName').value.trim();
        const img = document.getElementById('prodImgUrl').value.trim();
        const keywords = document.getElementById('prodKeywords').value.trim();
        const priceInput = parseFloat(document.getElementById('prodPrice').value);
        const price = isNaN(priceInput) ? NaN : Math.ceil(priceInput);
        const discountCode = document.getElementById('prodDiscount').value.trim();
        const shopee1 = document.getElementById('prodShopee1').value.trim();
        const shopee2 = document.getElementById('prodShopee2').value.trim();

        if(!subCat || !name || isNaN(price)) {
            alert("กรุณากรอกข้อมูลหลักให้ครบถ้วน");
            return;
        }

        const productData = {
            name, img, price, discountCode, shopee1, shopee2, 
            subCategory: subCat, 
            childCategory: childCat || "", 
            keywords: keywords
        };

        if(editingProductId) {
            db.collection("products").doc(editingProductId).update(productData)
                .then(() => { alert("แก้ไขรายละเอียดสินค้าสำเร็จ!"); resetProductForm(); });
        } else {
            const newId = 'p-' + Date.now();
            productData.orderIndex = products.length; 
            db.collection("products").doc(newId).set(productData)
                .then(() => { alert("เพิ่มสินค้าชิ้นใหม่สำเร็จ!"); resetProductForm(); });
        }
    });

    cancelEditBtn.addEventListener('click', () => { resetProductForm(); });
}

function editProduct(id) {
    const p = products.find(prod => prod.id === id);
    if(!p) return;
    editingProductId = id;
    document.getElementById('formModeTitle').innerHTML = `<i class="fa-solid fa-pen-to-square mr-2 text-amber-500"></i>แก้ไขสินค้า`;
    document.getElementById('cancelEditBtn').classList.remove('hidden');
    
    document.getElementById('prodSubCatSelect').value = p.subCategory;
    if(document.getElementById('prodSubCatSelect').onchange) {
        document.getElementById('prodSubCatSelect').onchange();
    }
    document.getElementById('prodChildCatSelect').value = p.childCategory || "";

    document.getElementById('prodName').value = p.name;
    document.getElementById('prodImgUrl').value = p.img;
    document.getElementById('prodKeywords').value = p.keywords || "";
    document.getElementById('prodPrice').value = Math.ceil(p.price); 
    document.getElementById('prodDiscount').value = p.discountCode || "";
    document.getElementById('prodShopee1').value = p.shopee1 || "";
    document.getElementById('prodShopee2').value = p.shopee2 || "";
    document.getElementById('productFormContainer').scrollIntoView({ behavior: 'smooth' });
}

function deleteProduct(id) {
    if(confirm("ยืนยันที่จะลบสินค้าชิ้นนี้อย่างถาวร?")) {
        db.collection("products").doc(id).delete();
    }
}

function resetProductForm() {
    editingProductId = null;
    document.getElementById('formModeTitle').innerHTML = `<i class="fa-solid fa-box-open mr-2"></i>3. เพิ่มสินค้าใหม่`;
    document.getElementById('cancelEditBtn').classList.add('hidden');
    document.getElementById('prodName').value = "";
    document.getElementById('prodImgUrl').value = "";
    document.getElementById('prodKeywords').value = "";
    document.getElementById('prodPrice').value = "";
    document.getElementById('prodDiscount').value = "";
    document.getElementById('prodShopee1').value = "";
    document.getElementById('prodShopee2').value = "";
}

// ==========================================================================
// [SECTION 8: DRAG SORTING] 
// ==========================================================================
function initGridSortable() {
    const grid = document.getElementById('productGrid');
    if (!grid || !isAdminLoggedIn || currentSortRule !== "default") return;
    destroyGridSortable();
    gridSortableInstance = new Sortable(grid, { animation: 180, handle: '.main-grid-handle', ghostClass: 'opacity-40' });
}

function destroyGridSortable() {
    if (gridSortableInstance) { gridSortableInstance.destroy(); gridSortableInstance = null; }
}

function setupProductGridOrderSave() {
    if (!saveOrderBtn) return;
    saveOrderBtn.addEventListener('click', () => {
        const grid = document.getElementById('productGrid');
        const cards = grid.querySelectorAll('[data-product-id]');
        if (cards.length === 0) return;

        const newlySortedIds = Array.from(cards).map(card => card.getAttribute('data-product-id'));
        const batch = db.batch();

        newlySortedIds.forEach((id, index) => {
            batch.update(db.collection("products").doc(id), { orderIndex: index });
        });

        batch.commit().then(() => alert(`👑 บันทึกตำแหน่งการจัดวางไปยังระบบเรียบร้อย!`));
    });
}