/**
 * ============================================================================
 *  ctii.mjs — điền BOL trên centraltransport.com bằng Playwright
 * ----------------------------------------------------------------------------
 *  Theo đúng `01_HuongDan_VanHanh/6_QuyTrinh_CTII.md` (JS-1 / JS-2 / JS-3).
 *  Form là **AngularJS**, nhận diện field qua `id`.
 *
 *  ⛔ HÀM NÀY KHÔNG BẤM SUBMIT. Submit trên CTII tạo **lệnh pickup thật với
 *     Central Transport, không huỷ được**. Nút `bSubmit` phải do nơi gọi bấm,
 *     sau khi đã kiểm bằng `kiemTra()`.
 *
 *  🔴 Ba cái bẫy đã ghi trong tài liệu, đừng bỏ:
 *   1. Bốn khối địa chỉ dùng TRÙNG id `country_1` / `state_` → lấy theo thứ tự
 *      [0]=shipper [1]=consignee [2]=thirdParty [3]=cod. Nhưng ĐỪNG tin vào đếm
 *      vị trí — `xacMinhKhoi()` so định danh scope Angular với `bol.*` cho chắc.
 *   2. Ô city là readOnly, do zip-lookup điền. Zip map nhiều city (30339 → ATL,
 *      ATLANTA, SMYRNA…) thì trang tự lấy dòng ĐẦU (ATL) và mở danh sách gợi ý.
 *      Phải CLICK THẬT vào gợi ý; chỉ set Angular model là giá trị hiện đúng
 *      nhưng danh sách vẫn mở = chưa chọn thật, dễ mất khi Submit.
 *   3. `optTerms` = Freight Charges (2 = Collect). `optFee`/`optCheck` là COD,
 *      đang disabled — ĐỪNG set.
 * ==========================================================================*/

import { TEN_BANG } from './bol-tinh.mjs';

/** Người gửi — cố định. Email theo 6_QuyTrinh_CTII.md (khác BOL_Form.html: info@). */
export const SHIPPER = {
  company: 'NOTS LOGISTICS / ALL FOR WOOD', address: '120 ENTERPRISE DR SW',
  country: 'USA', state: 'GEORGIA', city: 'CALHOUN', zip: '30701',
  contact: 'MARIO', email: 'b2b@allforwood.com', phone: '(762) 231-7977'
};

/** Bên trả cước — cố định. Zip 30339 là zip ĐA THÀNH PHỐ, phải chọn ATLANTA. */
export const THIRD_PARTY = {
  company: 'HomeDepot.Com #8119 - Attn: Freight Payables',
  address: '2455 Paces Ferry Rd NW',
  country: 'USA', state: 'GEORGIA', city: 'ATLANTA', zip: '30339'
};

export const CHI_DAN = [
  'Residential and Liftgate charges pre-approved if required',
  'Address Corrections and/or Reconsignment must be approved by Home Depot.com',
  'A 4-hour delivery appointment is required'
].join('\n');

const HELPER = `
  function setVal(el,val){ if(!el) return 'miss';
    var d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
    d&&d.set?d.set.call(el,val):el.value=val;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true})); return el.value; }
  function setSel(el,text){ if(!el) return 'miss';
    var op=[].slice.call(el.options).filter(function(o){return o.text.trim().toUpperCase()===String(text).toUpperCase();})[0];
    if(!op) return 'noopt'; el.value=op.value;
    el.dispatchEvent(new Event('change',{bubbles:true})); return op.text.trim(); }
`;

const chay = (page, than, arg) => page.evaluate(new Function('A', HELPER + than), arg);

/** Kiểm thứ tự 4 khối địa chỉ bằng scope Angular thay vì tin vào đếm vị trí. */
export async function xacMinhKhoi(page) {
  return page.evaluate(() => {
    const ng = window.angular;
    if (!ng) return ['(khong thay angular)'];
    const t = ng.element(document.getElementById('specialInstructions')).scope();
    const map = [['shipper', t.bol.shipper], ['consignee', t.bol.consignee],
                 ['thirdParty', t.bol.thirdParty], ['cod', t.bol.cod]];
    return [...document.querySelectorAll('[id^=state_]')].map((e, i) => {
      const o = ng.element(e).scope().obj;
      const m = map.find(m => m[1] === o);
      return `${i} -> ${m ? m[0] : '???'}`;
    });
  });
}

/**
 * Chọn city từ danh sách gợi ý bằng CLICK THẬT.
 * Trả {dom, conLai}. `conLai` phải = 0 — danh sách còn mở nghĩa là CHƯA chọn thật.
 */
export async function chonCity(page, idOCity, city) {
  return page.evaluate(([id, c]) => {
    const sug = [...document.querySelectorAll('.ct-suggestions')];
    const t = sug.find(s => (s.innerText || s.textContent || '').trim().toUpperCase() === c.toUpperCase());
    if (!t) return { dom: (document.getElementById(id) || {}).value, conLai: sug.length, thay: false,
                     coSan: sug.map(s => (s.innerText || '').trim()) };
    for (const ev of ['mousedown', 'mouseup', 'click']) {
      t.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
    }
    return { dom: (document.getElementById(id) || {}).value,
             conLai: document.querySelectorAll('.ct-suggestions').length, thay: true };
  }, [idOCity, city]);
}

async function datKhoiDiaChi(page, chiSo, { country, state }) {
  return chay(page, `
    var co=document.querySelectorAll('[id^=country_]')[A.i];
    var st=document.querySelectorAll('[id^=state_]')[A.i];
    return {country:setSel(co,A.country), state:setSel(st,A.state)};
  `, { i: chiSo, country, state });
}

/**
 * Điền toàn bộ BOL. KHÔNG submit.
 * @param dl {po, customerOrder, consignee:{ten,diaChi,city,bang,zip,phone}, tinh:{qty,weight,cls,moTa}, ngayPickupMdy}
 */
export async function dienBOL(page, dl, { tichPickup = true } = {}) {
  const nhatKy = [];
  const ghi = (b, kq) => nhatKy.push({ buoc: b, kq });

  await page.goto('https://www.centraltransport.com/shipment/bol',
                  { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  ghi('xac minh 4 khoi', await xacMinhKhoi(page));

  // ---- JS-1: BOL# + 3 khối địa chỉ --------------------------------------
  ghi('JS-1 o text', await chay(page, `
    var r={};
    r.bol   = setVal(document.getElementById('tBolNumber'), A.po);
    r.shCo  = setVal(document.getElementById('tShipperCompany'), A.sh.company);
    r.shAd  = setVal(document.getElementById('tShipperAddress'), A.sh.address);
    r.shZip = setVal(document.getElementById('shipper_zipCode'), A.sh.zip);
    r.shCt  = setVal(document.getElementById('tShipperContact'), A.sh.contact);
    r.shEm  = setVal(document.getElementById('tShipperEmail'), A.sh.email);
    r.shPh  = setVal(document.getElementById('tShipperPhone'), A.sh.phone);
    r.coCo  = setVal(document.getElementById('tConsigneeCompany'), A.co.company);
    r.coAd  = setVal(document.getElementById('tConsigneeAddress'), A.co.address);
    r.coZip = setVal(document.getElementById('consignee_zipCode'), A.co.zip);
    r.coCt  = setVal(document.getElementById('tConsigneeContact'), A.co.contact);
    r.coPh  = setVal(document.getElementById('tConsigneePhone'), A.co.phone);
    r.tpCo  = setVal(document.getElementById('tThirdPartCompany'), A.tp.company);
    r.tpAd  = setVal(document.getElementById('tThirdPartAddress'), A.tp.address);
    r.tpZip = setVal(document.getElementById('thirdParty_zipCode'), A.tp.zip);
    return r;
  `, {
    po: dl.po, sh: SHIPPER, tp: THIRD_PARTY,
    co: { company: dl.consignee.ten, address: dl.consignee.diaChi, zip: dl.consignee.zip,
          contact: dl.consignee.ten, phone: dl.consignee.phone || '' }
  }));

  await page.waitForTimeout(2500);   // chờ zip-lookup chạy

  const bangConsignee = TEN_BANG[dl.consignee.bang];
  if (!bangConsignee) throw new Error(`khong co ten day du cho bang "${dl.consignee.bang}"`);
  ghi('JS-1 country/state', {
    shipper: await datKhoiDiaChi(page, 0, SHIPPER),
    consignee: await datKhoiDiaChi(page, 1, { country: 'USA', state: bangConsignee }),
    thirdParty: await datKhoiDiaChi(page, 2, THIRD_PARTY)
  });

  // City: zip 30339 của Third Party map NHIỀU city -> phải click gợi ý ATLANTA
  await page.waitForTimeout(1500);
  ghi('chon city thirdParty', await chonCity(page, 'thirdParty_city', THIRD_PARTY.city));
  ghi('chon city consignee', await chonCity(page, 'consignee_city', dl.consignee.city));

  // ---- JS-2 -------------------------------------------------------------
  ghi('JS-2', await chay(page, `
    var r={};
    var rs=[].slice.call(document.querySelectorAll('input[type=radio]'));
    var ct=rs.filter(function(x){return x.name==='optTerms'&&x.value==='2';})[0];
    if(ct&&!ct.checked) ct.click(); r.collect = ct?ct.checked:'khong thay';
    var chL=document.getElementById('chLabels'); if(chL&&!chL.checked) chL.click();
    r.labels = chL?chL.checked:'khong thay';
    r.tBol=setVal(document.getElementById('tBol'),A.po);
    r.tPickup=setVal(document.getElementById('tPickup'),A.po);
    r.tRef=setVal(document.getElementById('tRef'),A.custOrder);
    r.lblNum=setVal(document.getElementById('tLabelNumber'),'1');
    r.lblPos=setVal(document.getElementById('tLabelPos'),'1');
    if(A.tichPickup){
      var chP=document.getElementById('chPickup1'); if(chP&&!chP.checked) chP.click();
      r.pickup = chP?chP.checked:'khong thay';
      r.pickupDate = setSel(document.getElementById('pickupDate'), A.ngay);
    } else { r.pickup='(co y KHONG tich)'; }
    r.units=setVal(document.getElementById('tUnits'),String(A.qty));
    r.weight=setVal(document.getElementById('tWeight'),String(A.weight));
    r.haz=setSel(document.getElementById('hazMat'),'NO');
    r.type=setSel(document.getElementById('freightType'),'PALLET');
    r.cls=setSel(document.getElementById('sel1_'),A.cls);
    r.desc=setVal(document.getElementById('description'),A.moTa);
    r.ghiChu=setVal(document.getElementById('specialInstructions'),A.chiDan);
    return r;
  `, {
    po: dl.po, custOrder: dl.customerOrder, ngay: dl.ngayPickupMdy, tichPickup,
    qty: dl.tinh.qty, weight: dl.tinh.weight, cls: dl.tinh.cls, moTa: dl.tinh.moTa, chiDan: CHI_DAN
  }));

  // ---- JS-3: hai nút Add ------------------------------------------------
  await page.waitForTimeout(1200);
  ghi('JS-3 nut Add', await page.evaluate(() => {
    const a1 = document.getElementById('bAddLabel');
    const a2 = document.getElementById('Button2');
    const r = {};
    if (a1 && !a1.disabled) { a1.click(); r.bAddLabel = 'da bam'; } else r.bAddLabel = a1 ? 'disabled' : 'khong thay';
    if (a2 && !a2.disabled) { a2.click(); r.Button2 = 'da bam'; } else r.Button2 = a2 ? 'disabled' : 'khong thay';
    return r;
  }));

  await page.waitForTimeout(1500);
  return nhatKy;
}

/** Đọc scope Angular để kiểm — tin cậy hơn đọc bảng HTML. */
export async function kiemTra(page) {
  return page.evaluate(() => {
    const ng = window.angular;
    if (!ng) return { loi: 'khong thay angular' };
    const t = ng.element(document.getElementById('specialInstructions')).scope();
    return {
      items: (t.bol.items || []).map(i => ({ units: i.units, weight: i.weight, haz: i.isHazMat,
        type: i.freightType, cls: i.nmfcClass && i.nmfcClass.class, desc: i.description })),
      soLabel: (t.bol.label && t.bol.label.items || []).length,
      cities: { sh: t.bol.shipper.city, co: t.bol.consignee.city, tp: t.bol.thirdParty.city },
      paymentTerm: t.bol.paymentTerm, isPickup: t.bol.isPickup,
      pickupDate: t.bol.pickupDate, bolNumber: t.bol.bolNumber
    };
  });
}

/** Điều kiện tối thiểu trước khi được phép Submit. Thiếu bất kỳ -> KHÔNG submit. */
export function datYeuCau(kq, dl) {
  const loi = [];
  if (!kq.items || kq.items.length !== 1) loi.push(`items = ${kq.items?.length} (phai dung 1 — bam Add 2 lan?)`);
  else {
    const i = kq.items[0];
    if (String(i.weight) !== String(dl.tinh.weight)) loi.push(`weight ${i.weight} != ${dl.tinh.weight}`);
    if (String(i.units) !== String(dl.tinh.qty)) loi.push(`units ${i.units} != ${dl.tinh.qty}`);
    if (String(i.cls) !== String(dl.tinh.cls)) loi.push(`class ${i.cls} != ${dl.tinh.cls}`);
    if (i.haz !== 'NO') loi.push(`hazMat = ${i.haz}`);
    if (i.type !== 'PALLET') loi.push(`freightType = ${i.type}`);
  }
  if (kq.paymentTerm !== '2') loi.push(`paymentTerm = ${kq.paymentTerm} (phai 2 = Collect)`);
  if (kq.bolNumber !== dl.po) loi.push(`bolNumber ${kq.bolNumber} != ${dl.po}`);
  if ((kq.cities?.tp || '').toUpperCase() !== 'ATLANTA') loi.push(`city thirdParty = ${kq.cities?.tp} (phai ATLANTA)`);
  if ((kq.cities?.sh || '').toUpperCase() !== 'CALHOUN') loi.push(`city shipper = ${kq.cities?.sh}`);
  return loi;
}
