// script.js (v6.0)
document.addEventListener('DOMContentLoaded', () => {

    // --- การตั้งค่าที่สำคัญ ---
    // คุณต้องนำ URL ที่ได้จากการ Deploy Google Apps Script มาใส่ที่นี่
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyslVNNqlQ7cDwTiw1vYm7KAVmHoj-NlkhRI31HZPugTRQz5DLi6MMcCxiDf-z7ebMV/exec";

    // --- ตัวแปรสำหรับจัดการสถานะ (State) ---
    let currentOrder = {}; // เก็บรายการอาหารที่สั่ง { itemID: { quantity: X, ... }, ... }
    let customerLocation = null; // เก็บพิกัดลูกค้า { lat: X, lng: Y }
    let deliveryInfo = { fee: 0, distance: 0 };
    let menuData = []; // เก็บข้อมูลเมนูทั้งหมดไว้เพื่อใช้งาน

    // --- ตัวแปรอ้างอิงถึง Element ในหน้าเว็บ ---
    const menuContainer = document.getElementById('menu-container');
    const loadingMenu = document.getElementById('loading-menu');
    const getLocationBtn = document.getElementById('get-location-btn');
    const locationStatus = document.getElementById('location-status');
    const totalPriceValue = document.getElementById('total-price-value');
    const grandTotalValue = document.getElementById('grand-total-value');
    const reviewOrderBtn = document.getElementById('review-order-btn');
    const summaryModal = document.getElementById('summary-modal');
    const thankYouModal = document.getElementById('thank-you-modal');
    const editOrderBtn = document.getElementById('edit-order-btn');
    const confirmOrderBtn = document.getElementById('confirm-order-btn');
    const closeThankYouBtn = document.getElementById('close-thank-you-btn');
    const modalSpinner = document.getElementById('modal-spinner');

    // --- ฟังก์ชันหลัก ---

    // 1. ดึงข้อมูลเมนูจาก Google Sheet
    async function fetchMenu() {
        try {
            const response = await fetch(SCRIPT_URL); // GET request by default
            const result = await response.json();

            if (result.status === 'success') {
                menuData = result.data;
                loadingMenu.style.display = 'none';
                menuData.forEach(createMenuItem); // สร้างรายการเมนูแต่ละอัน
            } else {
                loadingMenu.textContent = "ไม่สามารถโหลดเมนูได้: " + result.message;
            }
        } catch (error) {
            loadingMenu.textContent = "เกิดข้อผิดพลาดในการเชื่อมต่อ";
            console.error("Error fetching menu:", error);
        }
    }

    // 2. สร้าง Element ของเมนูแต่ละรายการ
    function createMenuItem(item) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'menu-item-dynamic';
        itemDiv.dataset.itemId = item.ItemID;

        let optionsHTML = '';
        if (item.Options) {
            const optionsArray = item.Options.split(',').map(s => s.trim());
            optionsHTML = `<div class="sub-options-container">` + optionsArray.map((opt, index) => `
                <label>
                    <input type="radio" name="option-${item.ItemID}" value="${opt}" ${index === 0 ? 'checked' : ''}>
                    <span>${opt}</span>
                </label>
            `).join('') + `</div>`;
        }

        itemDiv.innerHTML = `
            <img src="${item.ImageURL}" alt="${item.Name}" onerror="this.style.display='none'">
            <div class="menu-item-details">
                <span class="item-name">${item.Name}</span>
                <span class="item-price">${item.Price} บาท</span>
                ${optionsHTML}
                <input type="text" class="special-request-input" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)">
            </div>
            <div class="quantity-controls">
                <button type="button" class="btn-minus" style="display: none;">-</button>
                <span class="quantity-display"></span>
                <button type="button" class="btn-plus">+</button>
            </div>
        `;
        menuContainer.appendChild(itemDiv);

        const plusBtn = itemDiv.querySelector('.btn-plus');
        const minusBtn = itemDiv.querySelector('.btn-minus');
        plusBtn.addEventListener('click', () => updateQuantity(item.ItemID, 1));
        minusBtn.addEventListener('click', () => updateQuantity(item.ItemID, -1));
    }

    // 3. อัปเดตจำนวนสินค้า
    function updateQuantity(itemId, change) {
        const itemDiv = menuContainer.querySelector(`.menu-item-dynamic[data-item-id="${itemId}"]`);
        const itemData = menuData.find(i => i.ItemID === itemId);
        const currentQty = currentOrder[itemId] ? currentOrder[itemId].quantity : 0;
        const newQty = currentQty + change;

        if (newQty <= 0) {
            delete currentOrder[itemId];
        } else {
            const selectedOption = itemDiv.querySelector(`input[name="option-${itemId}"]:checked`)?.value || '';
            const specialRequest = itemDiv.querySelector('.special-request-input').value;
            currentOrder[itemId] = {
                quantity: newQty,
                name: itemData.Name,
                price: itemData.Price,
                option: selectedOption,
                request: specialRequest
            };
        }

        const qtyDisplay = itemDiv.querySelector('.quantity-display');
        const minusBtn = itemDiv.querySelector('.btn-minus');
        if (newQty > 0) {
            qtyDisplay.textContent = newQty;
            minusBtn.style.display = 'flex';
        } else {
            qtyDisplay.textContent = '';
            minusBtn.style.display = 'none';
        }
        calculateTotals();
    }
    
    // 4. คำนวณราคารวม
    function calculateTotals() {
        let foodTotal = 0;
        for (const id in currentOrder) {
            foodTotal += currentOrder[id].quantity * currentOrder[id].price;
        }

        const grandTotal = foodTotal + deliveryInfo.fee;
        totalPriceValue.textContent = foodTotal;
        grandTotalValue.textContent = grandTotal;

        reviewOrderBtn.disabled = foodTotal === 0;
    }

    // 5. ขอตำแหน่งปัจจุบันของลูกค้า
    function handleGetLocation() {
        if (!navigator.geolocation) {
            locationStatus.textContent = "บราวเซอร์ไม่รองรับการระบุตำแหน่ง";
            return;
        }
        locationStatus.textContent = "กำลังขอตำแหน่ง...";
        getLocationBtn.disabled = true;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                customerLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                locationStatus.textContent = "✅ ระบุตำแหน่งเรียบร้อยแล้ว";
                getLocationBtn.disabled = false;
            },
            (error) => {
                locationStatus.textContent = "⚠️ ไม่สามารถระบุตำแหน่งได้";
                console.error("Geolocation error:", error);
                getLocationBtn.disabled = false;
            }
        );
    }
    
    // 6. แสดง Modal สรุปรายการ
    async function showSummaryModal() {
        const name = document.getElementById('customer-name').value;
        const phone = document.getElementById('customer-phone').value;
        const address = document.getElementById('customer-address').value;

        if (!name || !phone || !address || Object.keys(currentOrder).length === 0 || !customerLocation) {
            alert("กรุณากรอกข้อมูลการจัดส่ง, เลือกรายการอาหาร และกดขอตำแหน่งให้ครบถ้วนครับ");
            return;
        }
        
        populateSummary();
        summaryModal.classList.add('active');
        modalSpinner.style.display = 'block';
        confirmOrderBtn.style.display = 'none';

        try {
            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors', // Required for simple POST to Apps Script
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    action: 'calculateFee',
                    lat: customerLocation.lat,
                    lng: customerLocation.lng
                })
            });
            
            // Note: with no-cors, we can't read the response. We have to "re-fetch" with GET to get data.
            // For simplicity here, we will just assume the POST worked and the fee logic is on the server.
            // A more robust solution involves a different callback mechanism.
            // Let's call the fee calculation endpoint properly to get a response.
            
            const feeResponse = await fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'calculateFee',
                    lat: customerLocation.lat,
                    lng: customerLocation.lng
                })
            });

            const result = await feeResponse.json();
            if (result.status === 'success') {
                deliveryInfo = { fee: result.fee, distance: result.distance };
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error("Error calculating fee:", error);
            deliveryInfo = { fee: 0, distance: 0 };
            alert("ไม่สามารถคำนวณค่าส่งได้: " + error.message);
        } finally {
            modalSpinner.style.display = 'none';
            confirmOrderBtn.style.display = 'block';
            calculateTotals(); 
            populateSummary();
        }
    }

    // 7. แสดงข้อมูลสรุปใน Modal
    function populateSummary() {
        const customerSummary = document.getElementById('customer-summary');
        const orderSummaryList = document.getElementById('order-summary-list');
        
        customerSummary.innerHTML = `
            <div><strong>ชื่อ:</strong> ${document.getElementById('customer-name').value}</div>
            <div><strong>โทร:</strong> ${document.getElementById('customer-phone').value}</div>
            <div><strong>ที่อยู่:</strong> ${document.getElementById('customer-address').value}</div>
        `;

        orderSummaryList.innerHTML = Object.values(currentOrder).map(item => {
            let details = `${item.quantity} x ${item.name}`;
            if (item.option) details += ` (${item.option})`;
            if (item.request) details += ` - ${item.request}`;
            return `<div class="item-line"><span>${details}</span><span>${item.price * item.quantity} บ.</span></div>`;
        }).join('');
        
        const foodTotal = parseFloat(totalPriceValue.textContent);
        document.getElementById('summary-food-total').textContent = `${foodTotal} บ.`;
        document.getElementById('summary-distance').textContent = deliveryInfo.distance ? `${deliveryInfo.distance} กม.` : 'N/A';
        document.getElementById('summary-delivery-fee').textContent = `${deliveryInfo.fee} บ.`;
        document.getElementById('summary-grand-total').textContent = `${foodTotal + deliveryInfo.fee} บ.`;
    }

    // 8. ยืนยันและส่งออเดอร์
    async function submitOrder() {
        confirmOrderBtn.disabled = true;
        confirmOrderBtn.textContent = 'กำลังส่ง...';

        const orderDetailsText = Object.values(currentOrder).map(item => {
             let details = `${item.quantity}x ${item.name}`;
            if (item.option) details += ` (${item.option})`;
            if (item.request) details += ` [${item.request}]`;
            return details;
        }).join('\n');

        const payload = {
            action: 'submitOrder',
            name: document.getElementById('customer-name').value,
            phone: document.getElementById('customer-phone').value,
            address: document.getElementById('customer-address').value,
            latitude: customerLocation.lat,
            longitude: customerLocation.lng,
            orderDetails: orderDetailsText,
            totalPrice: parseFloat(totalPriceValue.textContent),
            deliveryFee: deliveryInfo.fee,
        };

        try {
            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.status === 'success') {
                summaryModal.classList.remove('active');
                thankYouModal.classList.add('active');
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            alert("เกิดข้อผิดพลาดในการสั่งซื้อ: " + error.message);
        } finally {
            confirmOrderBtn.disabled = false;
            confirmOrderBtn.textContent = 'ยืนยันการสั่งซื้อ';
        }
    }
    
    // 9. รีเซ็ตฟอร์มทั้งหมด
    function resetForm() {
        document.getElementById('order-form').reset();
        currentOrder = {};
        customerLocation = null;
        deliveryInfo = { fee: 0, distance: 0 };
        locationStatus.textContent = "ยังไม่ได้ระบุตำแหน่ง";
        document.querySelectorAll('.quantity-display').forEach(el => el.textContent = '');
        document.querySelectorAll('.btn-minus').forEach(el => el.style.display = 'none');
        calculateTotals();
    }

    // --- Event Listeners ---
    getLocationBtn.addEventListener('click', handleGetLocation);
    reviewOrderBtn.addEventListener('click', showSummaryModal);
    editOrderBtn.addEventListener('click', () => summaryModal.classList.remove('active'));
    confirmOrderBtn.addEventListener('click', submitOrder);
    closeThankYouBtn.addEventListener('click', () => {
        thankYouModal.classList.remove('active');
        resetForm();
    });

    // --- เริ่มการทำงาน ---
    fetchMenu();
});
