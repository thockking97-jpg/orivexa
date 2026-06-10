// ==========================================================================
// [SECTION 1: DATA SYNC] การดึงฐานข้อมูลร่วมมาจากระบบร้านค้าหลัก (localStorage)
// ==========================================================================
let products = [];
let categories = [];

function loadDataFromStorage() {
    const localProds = localStorage.getItem('chic_glow_products');
    const localCats = localStorage.getItem('chic_glow_categories');

    if (localProds) {
        products = JSON.parse(localProds);
    } else {
        products = [
            { id: "p-1", name: "ลิปสติกเนื้อแมตต์ ชุ่มชื้นยาวนาน โทนส้มอิฐ เกาหลีสุดๆ", img: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?q=80&w=500", price: 350, discountCode: "25%=2000", subCategory: "ลิปสติก" },
            { id: "p-2", name: "เสื้อเบลเซอร์สไตล์มินิมอล ทรงหลวม แฟชั่นสาวออฟฟิศ ลุคคุณหนู", img: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=500", price: 1200, discountCode: "10%=500", subCategory: "เสื้อ" }
        ];
        saveToStorage();
    }

    if (localCats) {
        categories = JSON.parse(localCats);
    } else {
        categories = [
            { id: "cat-1", name: "เครื่องสำอาง", type: "main", sub: ["แป้ง", "ลิปสติก"] },
            { id: "cat-2", name: "แฟชั่น", type: "main", sub: ["เสื้อ", "กางเกง"] }
        ];
        saveToStorage();
    }
}

function saveToStorage() {
    localStorage.setItem('chic_glow_products', JSON.stringify(products));
    localStorage.setItem('chic_glow_categories', JSON.stringify(categories));
}

// ==========================================================================
// [SECTION 2: STATE VARIABLES] ตัวแปรควบคุมสถานะ
// ==========================================================================
let selectedProductIds = new Set(); 
let currentSearch = "";
let currentCategoryFilter = "all";
let currentDiscountFilter = "all";
let shouldSortSelectedTop = false; // ตัวแปรคุมสถานะว่าจะดันสินค้าที่เลือกขึ้นบนสุดหรือไม่

// ==========================================================================
// [SECTION 3: INITIALIZE & EVENT LISTENERS] ตัวเริ่มต้นระบบ
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    loadDataFromStorage();
    initFilters();
    renderBulkTable();

    // ตัวเปิดปิดกล่องข้อความแบบ Bulk
    document.getElementById('enableUpdatePrice').addEventListener('change', (e) => {
        const input = document.getElementById('batchPriceInput');
        input.disabled = !e.target.checked;
        input.className = e.target.checked ? "w-full p-2 border text-xs rounded-xl bg-white focus:outline-none" : "w-full p-2 border text-xs rounded-xl bg-gray-50 focus:outline-none";
    });

    document.getElementById('enableUpdateDiscount').addEventListener('change', (e) => {
        const input = document.getElementById('batchDiscountInput');
        input.disabled = !e.target.checked;
        input.className = e.target.checked ? "w-full p-2 border text-xs rounded-xl bg-white focus:outline-none" : "w-full p-2 border text-xs rounded-xl bg-gray-50 focus:outline-none";
    });

    // ดักฟังการสืบค้นข้อมูล
    document.getElementById('bulkSearchInput').addEventListener('input', (e) => {
        currentSearch = e.target.value.trim();
        renderBulkTable();
    });

    document.getElementById('bulkCategorySelect').addEventListener('change', (e) => {
        currentCategoryFilter = e.target.value;
        renderBulkTable();
    });

    document.getElementById('bulkDiscountFilterSelect').addEventListener('change', (e) => {
        currentDiscountFilter = e.target.value;
        renderBulkTable();
    });

    // ปุ่มกด Checkbox "เลือกทั้งหมด" บนหัวตาราง
    document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
        const displayedProducts = getFilteredProducts();
        if (e.target.checked) {
            displayedProducts.forEach(p => selectedProductIds.add(p.id));
        } else {
            displayedProducts.forEach(p => selectedProductIds.delete(p.id));
        }
        document.getElementById('selectedCountBadge').innerText = `เลือกอยู่ ${selectedProductIds.size} รายการ`;
        renderBulkTable();
    });

    // ปุ่มกดสั่งการ "เรียงเอาที่เลือกขึ้นบน" 
    document.getElementById('triggerSortBtn').addEventListener('click', () => {
        shouldSortSelectedTop = true; // สั่งเปิดสวิตช์ให้ดันขึ้นบนสุด
        renderBulkTable();
        // ปิดสวิตช์กลับเป็นเท็จ เพื่อให้การติ๊กครั้งต่อๆ ไปไม่กระโดดขัดจังหวะสายตาจนกว่าจะกดปุ่มนี้อีกครั้ง
        shouldSortSelectedTop = false; 
    });

    // ปุ่มกดยืนยันการแก้ไขข้อมูลแบบกลุ่ม (Bulk Actions)
    document.getElementById('applyBulkEditBtn').addEventListener('click', executeBulkEdit);
});

// ==========================================================================
// [SECTION 4: FILTER CONTROLS] ระบบคัดกรอง
// ==========================================================================
function initFilters() {
    const catSelect = document.getElementById('bulkCategorySelect');
    categories.forEach(mainCat => {
        mainCat.sub.forEach(subName => {
            const opt = document.createElement('option');
            opt.value = subName;
            opt.innerText = `${mainCat.name} ➔ ${subName}`;
            catSelect.appendChild(opt);
        });
    });
    updateDiscountFilterDropdown();
}

function updateDiscountFilterDropdown() {
    const discSelect = document.getElementById('bulkDiscountFilterSelect');
    discSelect.innerHTML = `<option value="all">แสดงโค้ดส่วนลดทั้งหมด</option><option value="none">[ไม่มีโค้ดส่วนลด]</option>`;
    
    let uniqueCodes = new Set();
    products.forEach(p => {
        if (p.discountCode && p.discountCode.trim() !== "") {
            uniqueCodes.add(p.discountCode.trim());
        }
    });

    uniqueCodes.forEach(code => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.innerText = `โค้ด: ${code}`;
        discSelect.appendChild(opt);
    });
    discSelect.value = currentDiscountFilter;
}

function getFilteredProducts() {
    return products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(currentSearch.toLowerCase());
        const matchesCategory = (currentCategoryFilter === "all" || p.subCategory === currentCategoryFilter);
        
        let matchesDiscount = true;
        if (currentDiscountFilter === "none") {
            matchesDiscount = (!p.discountCode || p.discountCode.trim() === "");
        } else if (currentDiscountFilter !== "all") {
            matchesDiscount = (p.discountCode === currentDiscountFilter);
        }
        return matchesSearch && matchesCategory && matchesDiscount;
    });
}

// ==========================================================================
// [SECTION 5: SORTING & RENDERING LOGIC + INLINE EDIT]
// ==========================================================================
// ตัวแปรชั่วคราวใช้เก็บลำดับที่ถูกจัดเรียงปัจจุบัน เพื่อป้องกันไม่ให้ตารางจัดแถวใหม่เองเวลาพิมพ์ช่องข้อมูลทีละชิ้น
let currentRenderedList = [];

function renderBulkTable() {
    const tbody = document.getElementById('bulkProductTableBody');
    tbody.innerHTML = "";

    let filteredList = getFilteredProducts();
    document.getElementById('bulkProductCount').innerText = `ทั้งหมด ${filteredList.length} รายการ`;

    // ทำการจัดเรียงเมื่อเปิดหน้าเว็บครั้งแรก หรือเมื่อมีการกดปุ่ม "เรียงเอาที่เลือกขึ้นบน" เท่านั้น
    if (currentRenderedList.length === 0 || shouldSortSelectedTop) {
        filteredList.sort((a, b) => {
            const aSelected = selectedProductIds.has(a.id) ? 1 : 0;
            const bSelected = selectedProductIds.has(b.id) ? 1 : 0;
            return bSelected - aSelected; 
        });
        currentRenderedList = filteredList; // บันทึกลำดับแถวไว้ใช้งานค้างสถานะ
    } else {
        // หากเป็นการค้นหาหรือกรองแบบปกติ ให้เอาค่าอัปเดตล่าสุดมาแทนที่โดยอิงตามสินค้าที่เหลืออยู่
        currentRenderedList = currentRenderedList.filter(cp => filteredList.some(fp => fp.id === cp.id));
        // ถ้ามีของใหม่หลุดเข้ากลุ่ม ให้เอาไปต่อตูดแถว
        filteredList.forEach(fp => {
            if (!currentRenderedList.some(cp => cp.id === fp.id)) {
                currentRenderedList.push(fp);
            }
        });
    }

    document.getElementById('selectedCountBadge').innerText = `เลือกอยู่ ${selectedProductIds.size} รายการ`;

    if (currentRenderedList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-400">ไม่พบข้อมูลสินค้าที่ตรงกับเงื่อนไข</td></tr>`;
        return;
    }

    currentRenderedList.forEach(p => {
        const isChecked = selectedProductIds.has(p.id);
        const tr = document.createElement('tr');
        tr.className = isChecked ? "bg-amber-50/40 hover:bg-amber-50 transition border-b" : "hover:bg-gray-50 transition border-b";
        
        tr.innerHTML = `
            <td class="py-3 px-4 text-center">
                <input type="checkbox" class="product-row-checkbox rounded border-gray-300 w-4 h-4 text-amber-600" data-id="${p.id}" ${isChecked ? 'checked' : ''}>
            </td>
            <td class="py-2 px-2 text-center">
                <img src="${p.img || 'https://via.placeholder.com/100'}" class="w-10 h-10 object-cover rounded-lg border bg-gray-50 mx-auto">
            </td>
            <td class="py-3 px-3">
                <div class="font-medium text-gray-800 line-clamp-1" title="${p.name}">${p.name}</div>
                <div class="text-[10px] text-gray-400 mt-0.5">หมวดหมู่: ${p.subCategory}</div>
            </td>
            <td class="py-3 px-3">
                <input type="number" class="inline-price-input w-full p-1 border rounded bg-white text-xs text-right font-semibold focus:border-amber-500 focus:outline-none" value="${p.price}">
            </td>
            <td class="py-3 px-3">
                <input type="text" class="inline-discount-input w-full p-1 border rounded bg-white text-xs font-mono focus:border-amber-500 focus:outline-none" placeholder="เช่น 25%=2500" value="${p.discountCode || ''}">
            </td>
            <td class="py-3 px-3 text-center">
                <button class="save-single-btn bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-sm transition">
                    <i class="fa-solid fa-floppy-disk"></i> เซฟ
                </button>
            </td>
        `;

        // 1. ดักฟังการติ๊กเลือก Checkbox รายชิ้น
        const chk = tr.querySelector('.product-row-checkbox');
        chk.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedProductIds.add(p.id);
                tr.className = "bg-amber-50/40 hover:bg-amber-50 transition border-b";
            } else {
                selectedProductIds.delete(p.id);
                tr.className = "hover:bg-gray-50 transition border-b";
                document.getElementById('selectAllCheckbox').checked = false;
            }
            document.getElementById('selectedCountBadge').innerText = `เลือกอยู่ ${selectedProductIds.size} รายการ`;
        });

        // 2. ดักฟังการกดปุ่ม "เซฟ" แบบรายชิ้น
        const saveSingleBtn = tr.querySelector('.save-single-btn');
        saveSingleBtn.addEventListener('click', () => {
            const singlePrice = parseFloat(tr.querySelector('.inline-price-input').value);
            const singleDiscount = tr.querySelector('.inline-discount-input').value.trim();

            if (isNaN(singlePrice) || singlePrice < 0) {
                return alert("กรุณากรอกราคาให้ถูกต้องด้วยครับ");
            }
            if (singleDiscount !== "" && !singleDiscount.includes('=')) {
                return alert("รูปแบบโค้ดส่วนลดผิดพลาด ต้องเป็นรูปแบบ % คู่กับยอดเพดานสูงสุด เช่น 25%=2500");
            }

            // นำข้อมูลไปอัปเดตลง Array ใหญ่
            const targetIdx = products.findIndex(prod => prod.id === p.id);
            if (targetIdx !== -1) {
                products[targetIdx].price = singlePrice;
                products[targetIdx].discountCode = singleDiscount;
                saveToStorage(); // บันทึกข้อมูล
                
                alert(`อัปเดตสินค้า "${p.name.substring(0, 20)}..." สำเร็จ!`);
                updateDiscountFilterDropdown();
            }
        });

        tbody.appendChild(tr);
    });
}

// ==========================================================================
// [SECTION 6: BULK EDIT EXECUTION] การประมวลผลเซฟแก้ไขข้อมูลแบบกลุ่ม (ฝั่งซ้าย)
// ==========================================================================
function executeBulkEdit() {
    if (selectedProductIds.size === 0) {
        alert("กรุณาติ๊กเลือก Checkbox รายการสินค้าอย่างน้อย 1 ชิ้น เพื่อทำการแก้ไขแบบกลุ่มครับ");
        return;
    }

    const changePriceChecked = document.getElementById('enableUpdatePrice').checked;
    const changeDiscountChecked = document.getElementById('enableUpdateDiscount').checked;
    
    const newPriceVal = parseFloat(document.getElementById('batchPriceInput').value);
    const newDiscountVal = document.getElementById('batchDiscountInput').value.trim();

    if (changePriceChecked && (isNaN(newPriceVal) || newPriceVal < 0)) {
        return alert("กรุณากรอกราคาปกติใหม่ให้ถูกต้องด้วยครับ");
    }
    if (changeDiscountChecked && newDiscountVal !== "" && !newDiscountVal.includes('=')) {
        return alert("รูปแบบโค้ดส่วนลดไม่ถูกต้อง เช่น 25%=2500");
    }
    if (!changePriceChecked && !changeDiscountChecked) {
        return alert("กรุณาเลือกติ๊กเปิดงานตัวเลือกที่คุณต้องการแก้ไขฝั่งซ้ายมือก่อนกดบันทึก");
    }

    if (!confirm(`ยืนยันการแก้ไขข้อมูลจำนวน ${selectedProductIds.size} รายการพร้อมกันใช่หรือไม่?`)) return;

    products = products.map(p => {
        if (selectedProductIds.has(p.id)) {
            let updatedProd = { ...p };
            if (changePriceChecked) updatedProd.price = newPriceVal;
            if (changeDiscountChecked) updatedProd.discountCode = newDiscountVal;
            return updatedProd;
        }
        return p;
    });

    saveToStorage();
    alert("ปรับปรุงราคาสินค้าและส่วนลดแบบกลุ่มเรียบร้อยแล้ว!");
    
    // เคลียร์ฟอร์มหลังงานเซฟกลุ่มเสร็จสิ้น
    document.getElementById('enableUpdatePrice').checked = false;
    document.getElementById('enableUpdateDiscount').checked = false;
    document.getElementById('batchPriceInput').value = "";
    document.getElementById('batchDiscountInput').value = "";
    document.getElementById('batchPriceInput').disabled = true;
    document.getElementById('batchDiscountInput').disabled = true;
    document.getElementById('selectAllCheckbox').checked = false;
    selectedProductIds.clear(); 
    currentRenderedList = []; // สั่งเคลียร์ประวัติสแนปชอตเพื่อให้วาดตารางใหม่พร้อมจัดลำดับกลุ่มที่เลือกใหม่ทั้งหมด

    updateDiscountFilterDropdown();
    renderBulkTable();
}