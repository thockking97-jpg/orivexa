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

// สั่งเปิดตัวเชื่อมต่อ Firebase
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

// ฟังก์ชันโหลดข้อมูลหลักจาก Cloud Firestore แบบเรียลไทม์
function loadAllData() {
    // 1. ดึงและติดตามข้อมูลแบนเนอร์ร้านค้า
    db.collection("settings").doc("banner").onSnapshot((doc) => {
        if (doc.exists) {
            siteBanner = doc.data();
        } else {
            db.collection("settings").doc("banner").set(siteBanner);
        }
        renderBanner();
    });

    // 2. ดึงและติดตามข้อมูลหมวดหมู่สินค้า
    db.collection("categories").orderBy("orderIndex", "asc").onSnapshot((snapshot) => {
        if (!snapshot.empty) {
            categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } else {
            const defaultCats = [
                { name: "เครื่องสำอาง", type: "main", sub: ["แป้ง", "ลิปสติก"], orderIndex: 0 },
                { name: "แฟชั่น", type: "main", sub: ["เสื้อ", "กางเกง"], orderIndex: 1 }
            ];
            defaultCats.forEach((cat, index) => {
                db.collection("categories").doc('cat-' + (Date.now() + index)).set(cat);
            });
            categories = defaultCats;
        }
        renderCategories();
        renderProducts();
    });

    // 3. ดึงและติดตามข้อมูลรายการสินค้าทั้งหมด (ปรับแก้ไม่ให้เด้งกลับเมื่อกดลบ)
    db.collection("products").orderBy("orderIndex", "asc").onSnapshot((snapshot) => {
        // ดึงข้อมูลสินค้าที่อยู่บน Firestore มาเก็บไว้ในตัวแปร products เสมอ (แม้จะเป็นอาเรย์ว่างก็ตาม)
        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProducts();
    });
}

// ==========================================================================
// [SECTION 2: STATE VARIABLES] ตัวแปรคุมสถานะการทำงานของระบบ
// ==========================================================================
let isAdminLoggedIn = false;     
let currentFilter = "all";       
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
    // แก้ไขจากการเปลี่ยน backgroundImage ที่ตัว #heroSection โดยตรง
    // ให้เปลี่ยนมาใส่ src ของแท็ก img ด้านใน เพื่อควบคุมอัตราส่วนรูปภาพได้ 100% 
    const bannerImg = document.getElementById('heroImage');
    if (bannerImg) {
        bannerImg.src = siteBanner.url;
    } else {
        // กรณีโค้ด HTML เดิมยังไม่ปรับ ให้ใช้แบบพื้นหลังสำรอง
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
        const matchesCategory = (currentFilter === "all" || p.subCategory === currentFilter);
        const cleanQuery = searchKeyword.toLowerCase().trim();
        const matchesName = p.name ? p.name.toLowerCase().includes(cleanQuery) : false;
        const productKeywordsStr = p.keywords ? p.keywords.toLowerCase() : "";
        const matchesKeywords = productKeywordsStr.includes(cleanQuery);
        return matchesCategory && (matchesName || matchesKeywords);
    });

    if (currentSortRule === "price-asc") {
        filtered.sort((a, b) => {
            const priceA = calculateDiscountPrice(a.price, a.discountCode).finalPrice;
            const priceB = calculateDiscountPrice(b.price, b.discountCode).finalPrice;
            return priceA - priceB;
        });
    } else if (currentSortRule === "price-desc") {
        filtered.sort((a, b) => {
            const priceA = calculateDiscountPrice(a.price, a.discountCode).finalPrice;
            const priceB = calculateDiscountPrice(b.price, b.discountCode).finalPrice;
            return priceB - priceA;
        });
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
                <div class="absolute top-2 left-2 bg-black/60 text-white w-7 h-7 rounded-full text-xs shadow cursor-grab active:cursor-grabbing flex items-center justify-center z-20 main-grid-handle" title="ลากการ์ดชิ้นนี้เพื่อสลับอันดับ">
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

        const displayOriginalPrice = Math.ceil(p.price);

        const card = document.createElement('div');
        card.className = "product-card bg-white rounded-2xl overflow-hidden border border-[#F0EAE5] shadow-sm hover:shadow-md transition relative flex flex-col justify-between";
        card.setAttribute('data-product-id', p.id);
        card.innerHTML = `
            ${dragHandleHTML}
            ${adminControls}
            <div>
                <div class="aspect-square w-full overflow-hidden bg-gray-100 relative">
                    <img src="${p.img || 'https://via.placeholder.com/400'}" class="w-full h-full object-cover shadow-inner" alt="Product Image">
                    ${discInfo.hasDiscount ? `<span class="absolute bottom-2 left-2 bg-[#EE4D2D] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">ลดพิเศษ</span>` : ''}
                </div>
                <div class="p-3">
                    <p class="text-xs text-gray-400 mb-1"># ${p.subCategory}</p>
                    <h4 class="font-medium text-xs md:text-sm text-[#4A4A4A] line-clamp-2 h-8 md:h-10 mb-2">${p.name}</h4>
                </div>
            </div>
            <div class="p-3 pt-0">
                <div class="flex items-baseline space-x-1.5 mb-3">
                    <span class="text-sm md:text-base font-bold text-[#EE4D2D]">฿${discInfo.finalPrice.toLocaleString()}</span>
                    ${discInfo.hasDiscount ? `<span class="text-[10px] md:text-xs text-gray-400 line-through">฿${displayOriginalPrice.toLocaleString()}</span>` : ''}
                </div>
                ${shopeeButtonsHTML}
            </div>
        `;
        grid.appendChild(card);
    });

    initGridSortable();
}

function renderCategories() {
    const menuContainer = document.getElementById('categoryMenu');
    const adminCatList = document.getElementById('adminCategoryList');
    const catTypeSelect = document.getElementById('catTypeSelect');
    const prodSubCatSelect = document.getElementById('prodSubCatSelect');

    if(!menuContainer) return; 

    menuContainer.innerHTML = "";
    adminCatList.innerHTML = "";
    catTypeSelect.innerHTML = `<option value="main">เป็นหมวดหมู่หลักใหม่</option>`;
    prodSubCatSelect.innerHTML = "";

    const allBtn = document.createElement('button');
    allBtn.className = `px-3 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-xl whitespace-nowrap text-left transition ${currentFilter === 'all' ? 'bg-[#D4A373] text-white font-bold' : 'bg-[#FAF7F5] text-gray-600 hover:bg-gray-100'}`;
    allBtn.innerText = "🌟 สินค้าทั้งหมด";
    allBtn.onclick = () => { currentFilter = "all"; updateActiveCategoryUI(allBtn); renderProducts(); };
    menuContainer.appendChild(allBtn);

    categories.forEach((mainCat, mainIdx) => {
        const opt = document.createElement('option');
        opt.value = mainCat.id;
        opt.innerText = `ผูกเข้ากับหมวดหมู่หลัก: ${mainCat.name}`;
        catTypeSelect.appendChild(opt);

        const mainTitle = document.createElement('div');
        mainTitle.className = "text-[11px] uppercase font-bold tracking-wider text-gray-400 mt-3 mb-1 pl-2 hidden md:block";
        mainTitle.innerText = mainCat.name;
        menuContainer.appendChild(mainTitle);

        const adminMainRow = document.createElement('div');
        adminMainRow.className = "bg-white p-2 rounded-xl border flex items-center justify-between text-xs";
        adminMainRow.innerHTML = `
            <div class="font-bold text-[#4A4A4A]">${mainCat.name} <span class="text-[10px] text-gray-400 font-normal">(หลัก)</span></div>
            <div class="flex items-center space-x-1.5">
                <button onclick="moveCategory(${mainIdx}, 'up')" class="text-gray-400 hover:text-black"><i class="fa-solid fa-arrow-up"></i></button>
                <button onclick="moveCategory(${mainIdx}, 'down')" class="text-gray-400 hover:text-black"><i class="fa-solid fa-arrow-down"></i></button>
                <button onclick="editCategoryName('${mainCat.id}', 'main')" class="text-blue-500 hover:text-blue-700 mx-1"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteCategory('${mainCat.id}', 'main')" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;
        adminCatList.appendChild(adminMainRow);

        if (mainCat.sub && Array.isArray(mainCat.sub)) {
            mainCat.sub.forEach((subCat, subIdx) => {
                const subBtn = document.createElement('button');
                subBtn.className = `px-3 py-1.5 md:py-2 md:pl-5 text-xs rounded-xl whitespace-nowrap text-left transition ${currentFilter === subCat ? 'bg-[#EAE2B7] text-[#4A4A4A] font-bold shadow-sm' : 'bg-[#FAF7F5] text-gray-600 hover:bg-gray-100'}`;
                subBtn.innerText = `${subCat}`;
                subBtn.onclick = () => { currentFilter = subCat; updateActiveCategoryUI(subBtn); renderProducts(); };
                menuContainer.appendChild(subBtn);

                const prodSubOpt = document.createElement('option');
                prodSubOpt.value = subCat;
                prodSubOpt.innerText = `${mainCat.name} ➔ ${subCat}`;
                prodSubCatSelect.appendChild(prodSubOpt);

                const adminSubRow = document.createElement('div');
                adminSubRow.className = "bg-neutral-50 p-1.5 pl-6 rounded-lg border border-dashed flex items-center justify-between text-xs";
                adminSubRow.innerHTML = `
                    <div class="text-gray-600">▪ ${subCat}</div>
                    <div class="flex items-center space-x-1.5">
                        <button onclick="moveSubCategory(${mainIdx}, ${subIdx}, 'up')" class="text-gray-400 hover:text-black"><i class="fa-solid fa-arrow-up"></i></button>
                        <button onclick="moveSubCategory(${mainIdx}, ${subIdx}, 'down')" class="text-gray-400 hover:text-black"><i class="fa-solid fa-arrow-down"></i></button>
                        <button onclick="editCategoryName('${mainCat.id}', 'sub', ${subIdx})" class="text-blue-500 hover:text-blue-700 mx-0.5"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deleteCategory('${mainCat.id}', 'sub', ${subIdx})" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                `;
                adminCatList.appendChild(adminSubRow);
            });
        }
    });
}

function updateActiveCategoryUI(activeBtn) {
    document.getElementById('currentCategoryTitle').innerText = currentFilter === 'all' ? 'สินค้าทั้งหมด' : `หมวดหมู่: ${currentFilter}`;
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    searchKeyword = e.target.value;
    renderProducts();
});

// ==========================================================================
// [SECTION 5: ADMIN AUTHENTICATION] การเข้าสู่ระบบผู้ดูแลหลังบ้าน
// ==========================================================================
adminBtn.addEventListener('click', () => { loginModal.classList.remove('hidden'); usernameInput.focus(); });
closeLoginBtn.addEventListener('click', () => { loginModal.classList.add('hidden'); loginError.classList.add('hidden'); });

function executeLogin() {
    const email = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        loginError.innerText = "กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน";
        loginError.classList.remove('hidden');
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            loginModal.classList.add('hidden');
            loginError.classList.add('hidden');
        })
        .catch((error) => {
            console.error(error);
            loginError.innerText = "อีเมลหรือรหัสผ่านระบบหลังบ้านไม่ถูกต้อง";
            loginError.classList.remove('hidden');
        });
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
    const handleEnter = (event) => {
        if (event.key === "Enter") {
            event.preventDefault(); 
            executeLogin();
        }
    };
    usernameInput.addEventListener('keydown', handleEnter);
    passwordInput.addEventListener('keydown', handleEnter);
}

function injectAdminShortcutMenu() {
    let oldShortcut = document.getElementById('adminShortcutBar');
    if(oldShortcut) oldShortcut.remove();

    const shortcutDiv = document.createElement('div');
    shortcutDiv.id = "adminShortcutBar";
    shortcutDiv.className = "bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-6 flex flex-wrap gap-2 items-center text-xs";
    shortcutDiv.innerHTML = `
        <span class="font-bold text-amber-800"><i class="fa-solid fa-toolbox mr-1"></i> เครื่องมือจัดการด่วนหลังบ้าน:</span>
        <a href="price.html" class="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1.5 rounded-lg transition shadow-sm">
            <i class="fa-solid fa-calculator mr-1"></i> แก้ไขราคา & ส่วนลดแบบกลุ่ม
        </a>
        `;
    adminPanel.insertBefore(shortcutDiv, adminPanel.firstChild);
}

logoutBtn.addEventListener('click', () => {
    auth.signOut().then(() => {
        handleAdminLogoutSuccess();
    });
});

function handleAdminLogoutSuccess() {
    isAdminLoggedIn = false;
    adminPanel.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    adminBtn.classList.remove('hidden');
    
    saveOrderBtn.style.display = 'none';

    usernameInput.value = "";
    passwordInput.value = "";
    
    let oldShortcut = document.getElementById('adminShortcutBar');
    if(oldShortcut) oldShortcut.remove();

    resetProductForm();
    renderProducts(); 
}

// ==========================================================================
// [SECTION 6: ADMIN CONTROL - BANNER & CATEGORIES] บันทึกหมวดหมู่และปกไป Firestore
// ==========================================================================

document.getElementById('saveHeroBtn').addEventListener('click', () => {
    const updateBanner = {
        url: document.getElementById('editHeroUrl').value,
        title: document.getElementById('editHeroTitle').value,
        subtitle: document.getElementById('editHeroSub').value
    };
    db.collection("settings").doc("banner").set(updateBanner)
        .then(() => alert("อัปเดตหน้าปกและข้อความไปยังคลาวด์เรียบร้อย!"))
        .catch(err => alert("เกิดข้อผิดพลาด: " + err.message));
});

document.getElementById('addCatBtn').addEventListener('click', () => {
    const type = document.getElementById('catTypeSelect').value;
    const name = document.getElementById('newCatName').value.trim();
    if(!name) return alert("กรุณากรอกชื่อหมวดหมู่ด้วยครับ");

    if(type === "main") {
        const newId = 'cat-' + Date.now();
        db.collection("categories").doc(newId).set({
            name: name,
            type: "main",
            sub: [],
            orderIndex: categories.length
        });
    } else {
        const targetMain = categories.find(c => c.id === type);
        if(targetMain) {
            const updatedSub = [...(targetMain.sub || []), name];
            db.collection("categories").doc(type).update({ sub: updatedSub });
        }
    }
    document.getElementById('newCatName').value = "";
});

function deleteCategory(mainCatId, type, subIdx = null) {
    if(!confirm("คุณมั่นใจไหมที่จะลบหมวดหมู่นี้?")) return;
    
    if(type === 'main') { 
        db.collection("categories").doc(mainCatId).delete();
    } else if(type === 'sub' && subIdx !== null) { 
        const targetMain = categories.find(c => c.id === mainCatId);
        if(targetMain) {
            const updatedSub = [...targetMain.sub];
            updatedSub.splice(subIdx, 1);
            db.collection("categories").doc(mainCatId).update({ sub: updatedSub });
        }
    }
}

function editCategoryName(mainCatId, type, subIdx = null) {
    const targetMain = categories.find(c => c.id === mainCatId);
    if(!targetMain) return;

    if(type === 'main') {
        const newName = prompt("แก้ไขชื่อหมวดหมู่หลัก:", targetMain.name);
        if(newName && newName.trim() !== "") {
            db.collection("categories").doc(mainCatId).update({ name: newName.trim() });
        }
    } else {
        const oldName = targetMain.sub[subIdx];
        const newName = prompt("แก้ไขชื่อหมวดหมู่ย่อย:", oldName);
        if(newName && newName.trim() !== "") {
            const updatedSub = [...targetMain.sub];
            updatedSub[subIdx] = newName.trim();
            db.collection("categories").doc(mainCatId).update({ sub: updatedSub });
        }
    }
}

function moveCategory(index, direction) {
    let targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const batch = db.batch();
    const cat1 = db.collection("categories").doc(categories[index].id);
    const cat2 = db.collection("categories").doc(categories[targetIndex].id);

    batch.update(cat1, { orderIndex: targetIndex });
    batch.update(cat2, { orderIndex: index });
    batch.commit();
}

function moveSubCategory(mainIdx, subIdx, direction) {
    let targetSubIdx = direction === 'up' ? subIdx - 1 : subIdx + 1;
    let subList = categories[mainIdx].sub;
    if (targetSubIdx < 0 || targetSubIdx >= subList.length) return;

    let temp = subList[subIdx];
    subList[subIdx] = subList[targetSubIdx];
    subList[targetSubIdx] = temp;

    db.collection("categories").doc(categories[mainIdx].id).update({ sub: subList });
}

// ==========================================================================
// [SECTION 7: ADMIN CONTROL - PRODUCT MGR] จัดการสินค้า ขึ้น-ลง Cloud Firestore
// ==========================================================================

function setupAdminForms() {
    const saveProductBtn = document.getElementById('saveProductBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    saveProductBtn.addEventListener('click', () => {
        const subCat = document.getElementById('prodSubCatSelect').value;
        const name = document.getElementById('prodName').value.trim();
        const img = document.getElementById('prodImgUrl').value.trim();
        const keywords = document.getElementById('prodKeywords').value.trim();
        const priceInput = parseFloat(document.getElementById('prodPrice').value);
        const price = isNaN(priceInput) ? NaN : Math.ceil(priceInput);
        const discountCode = document.getElementById('prodDiscount').value.trim();
        const shopee1 = document.getElementById('prodShopee1').value.trim();
        const shopee2 = document.getElementById('prodShopee2').value.trim();

        if(!subCat || !name || isNaN(price)) {
            alert("กรุณากรอก หมวดหมู่, ชื่อสินค้า และราคาปกติ ให้ครบถ้วน");
            return;
        }

        const productData = {
            name, img, price, discountCode, shopee1, shopee2, 
            subCategory: subCat, 
            keywords: keywords
        };

        if(editingProductId) {
            db.collection("products").doc(editingProductId).update(productData)
                .then(() => {
                    alert("แก้ไขรายละเอียดสินค้าสำเร็จ!");
                    resetProductForm();
                })
                .catch(err => alert("เกิดข้อผิดพลาด: " + err.message));
        } else {
            const newId = 'p-' + Date.now();
            productData.orderIndex = products.length; 
            
            db.collection("products").doc(newId).set(productData)
                .then(() => {
                    alert("เพิ่มสินค้าชิ้นใหม่เรียบร้อย!");
                    resetProductForm();
                })
                .catch(err => alert("เกิดข้อผิดพลาด: " + err.message));
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
    document.getElementById('saveProductBtn').innerText = "บันทึกการแก้ไขสินค้า";
    document.getElementById('saveProductBtn').className = "w-full py-2.5 bg-amber-500 text-white font-bold rounded-xl shadow-sm hover:bg-amber-600 transition mt-2 text-sm";

    document.getElementById('prodSubCatSelect').value = p.subCategory;
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
    if(confirm("ยืนยันที่จะลบสินค้าชิ้นนี้ออกอย่างถาวรใช่ไหม?")) {
        db.collection("products").doc(id).delete()
            .then(() => {
                if(editingProductId === id) resetProductForm();
            })
            .catch(err => alert("ลบไม่สำเร็จ: " + err.message));
    }
}

function resetProductForm() {
    editingProductId = null;
    document.getElementById('formModeTitle').innerHTML = `<i class="fa-solid fa-box-open mr-2"></i>3. เพิ่มสินค้าใหม่`;
    document.getElementById('cancelEditBtn').classList.add('hidden');
    document.getElementById('saveProductBtn').innerText = "บันทึกสินค้า";
    document.getElementById('saveProductBtn').className = "w-full py-2.5 bg-[#D4A373] text-white font-bold rounded-xl shadow-sm hover:bg-[#C39262] transition mt-2 text-sm";
    
    document.getElementById('prodName').value = "";
    document.getElementById('prodImgUrl').value = "";
    document.getElementById('prodKeywords').value = "";
    document.getElementById('prodPrice').value = "";
    document.getElementById('prodDiscount').value = "";
    document.getElementById('prodShopee1').value = "";
    document.getElementById('prodShopee2').value = "";
}

// ==========================================================================
// [SECTION 8: IN-LINE PRODUCT GRID DRAG SORTING] บันทึกการลากจัดอันดับสินค้าด่วน
// ==========================================================================

function initGridSortable() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    destroyGridSortable();

    if (isAdminLoggedIn && currentSortRule === "default") {
        gridSortableInstance = new Sortable(grid, {
            animation: 180,
            handle: '.main-grid-handle', 
            ghostClass: 'opacity-40',    
            onStart: function() {
                if (navigator.vibrate) navigator.vibrate(10);
            }
        });
    }
}

function destroyGridSortable() {
    if (gridSortableInstance) {
        gridSortableInstance.destroy();
        gridSortableInstance = null;
    }
}

function setupProductGridOrderSave() {
    if (!saveOrderBtn) return;

    saveOrderBtn.addEventListener('click', () => {
        const grid = document.getElementById('productGrid');
        const cards = grid.querySelectorAll('[data-product-id]');
        
        if (cards.length === 0) {
            alert("⚠️ ไม่พบข้อมูลการจัดเรียงที่จะบันทึกครับ");
            return;
        }

        const newlySortedIds = Array.from(cards).map(card => card.getAttribute('data-product-id'));
        const batch = db.batch();

        if (currentFilter === "all") {
            newlySortedIds.forEach((id, index) => {
                const docRef = db.collection("products").doc(id);
                batch.update(docRef, { orderIndex: index });
            });
        } else {
            const otherProducts = products.filter(p => p.subCategory !== currentFilter);
            otherProducts.sort((a,b) => (a.orderIndex || 0) - (b.orderIndex || 0));

            newlySortedIds.forEach((id, index) => {
                const docRef = db.collection("products").doc(id);
                batch.update(docRef, { orderIndex: index });
            });

            otherProducts.forEach((prod, index) => {
                const docRef = db.collection("products").doc(prod.id);
                batch.update(docRef, { orderIndex: newlySortedIds.length + index });
            });
        }

        batch.commit()
            .then(() => {
                const messageScope = currentFilter === "all" ? "สินค้าทั้งหมดของร้าน" : `หมวดหมู่ "${currentFilter}"`;
                alert(`👑 บันทึกอันดับการจัดวางสินค้าในส่วน ${messageScope} ไปยังระบบคลาวด์เรียบร้อย!`);
            })
            .catch(err => alert("บันทึกลำดับไม่สำเร็จ: " + err.message));
    });
}