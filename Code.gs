// ================================================================
// HI Health - Google Apps Script 백엔드
// ================================================================
// 설정 방법:
// 1. sheets.google.com 에서 새 스프레드시트 생성
// 2. URL에서 스프레드시트 ID 복사 (/d/ 와 /edit 사이의 값)
// 3. 아래 SPREADSHEET_ID 에 붙여넣기
// 4. 확장 프로그램 > Apps Script 에서 이 코드 붙여넣기
// 5. 배포 > 새 배포 > 유형: 웹 앱
//    - 실행 계정: 나
//    - 액세스: 모든 사용자
// 6. 배포 후 웹 앱 URL 복사
// 7. index.html 의 SCRIPT_URL 과 user-admin.html 에 붙여넣기
// ================================================================

const SPREADSHEET_ID = 'Y147IOXY2-JFrMLmmMjCZjWPwSmWJHcd9Hf0NtXAsVE8E';

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'getAll';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  try {
    const result = {};
    if (action === 'getAll' || action === 'getUsers') {
      result.users = sheetToObjects(getOrCreateSheet(ss, 'Users',
        ['deviceId','name','avatar','empId','dept','points','streak','tags','registrationId','updatedAt']));
    }
    if (action === 'getAll' || action === 'getWorkouts') {
      result.workouts = sheetToObjects(getOrCreateSheet(ss, 'Workouts',
        ['id','deviceId','userName','date','exId','exName','duration','points','memo','ts']));
    }
    if (action === 'getAll' || action === 'getPosts') {
      result.posts = sheetToObjects(getOrCreateSheet(ss, 'Posts',
        ['id','deviceId','userName','body','exTag','userTags','ts']));
    }
    if (action === 'getAll' || action === 'getRegistrations') {
      result.registrations = sheetToObjects(getOrCreateSheet(ss, 'Registrations',
        ['id','deviceId','empId','name','dept','phone','shoeSize','familyParticipation','familyCount','status','registeredAt']));
    }
    if (action === 'getAll' || action === 'getOrders') {
      result.orders = sheetToObjects(getOrCreateSheet(ss, 'Orders',
        ['id','deviceId','userName','name','phone','pickup','addr','items','total','status','orderedAt']));
    }
    if (action === 'getAll' || action === 'getGlucose') {
      result.glucose = sheetToObjects(getOrCreateSheet(ss, 'Glucose',
        ['id','deviceId','userName','value','timing','points','ts']));
    }
    // 사번으로 사용자 데이터 조회 (로그인 시 사용)
    if (action === 'getUserData') {
      const empId = e.parameter.empId || '';
      const users = sheetToObjects(getOrCreateSheet(ss, 'Users',
        ['deviceId','name','avatar','empId','dept','points','streak','tags','registrationId','updatedAt']));
      const user = users.find(u => String(u.empId).toUpperCase() === empId.toUpperCase());
      if (!user) {
        result.found = false;
      } else {
        const did = user.deviceId;
        result.found = true;
        result.user = user;
        result.workouts = sheetToObjects(getOrCreateSheet(ss, 'Workouts',
          ['id','deviceId','userName','date','exId','exName','duration','points','memo','ts']))
          .filter(w => w.deviceId === did);
        result.glucose = sheetToObjects(getOrCreateSheet(ss, 'Glucose',
          ['id','deviceId','userName','value','timing','points','ts']))
          .filter(g => g.deviceId === did);
        result.posts = sheetToObjects(getOrCreateSheet(ss, 'Posts',
          ['id','deviceId','userName','body','exTag','userTags','ts']))
          .filter(p => p.deviceId === did);
      }
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const { action, payload } = body;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  try {
    let result = {};
    switch (action) {

      case 'syncUser': {
        const sheet = getOrCreateSheet(ss, 'Users',
          ['deviceId','name','avatar','empId','dept','points','streak','tags','registrationId','updatedAt']);
        const data = sheetToObjects(sheet);
        const p = payload;
        const row = [
          p.deviceId, p.name||'', p.avatar||'', p.empId||'', p.dept||'',
          p.points||0, p.streak||0, (p.tags||[]).join(','), p.registrationId||'',
          new Date().toISOString()
        ];
        const idx = data.findIndex(u => u.deviceId === p.deviceId);
        if (idx >= 0) {
          sheet.getRange(idx + 2, 1, 1, row.length).setValues([row]);
        } else {
          sheet.appendRow(row);
        }
        result = { synced: true };
        break;
      }

      case 'addWorkout': {
        const sheet = getOrCreateSheet(ss, 'Workouts',
          ['id','deviceId','userName','date','exId','exName','duration','points','memo','ts']);
        const p = payload;
        // 중복 방지 (같은 id)
        const data = sheetToObjects(sheet);
        if (!data.find(w => String(w.id) === String(p.id))) {
          sheet.appendRow([p.id, p.deviceId, p.userName||'', p.date||'', p.exId||'', p.exName||'', p.duration||0, p.points||0, p.memo||'', p.ts||'']);
        }
        result = { added: true };
        break;
      }

      case 'deleteWorkout': {
        const sheet = getOrCreateSheet(ss, 'Workouts',
          ['id','deviceId','userName','date','exId','exName','duration','points','memo','ts']);
        const data = sheetToObjects(sheet);
        const idx = data.findIndex(w => String(w.id) === String(body.id));
        if (idx >= 0) sheet.deleteRow(idx + 2);
        result = { deleted: true };
        break;
      }

      case 'addPost': {
        const sheet = getOrCreateSheet(ss, 'Posts',
          ['id','deviceId','userName','body','exTag','userTags','ts']);
        const p = payload;
        const data = sheetToObjects(sheet);
        if (!data.find(x => String(x.id) === String(p.id))) {
          sheet.appendRow([p.id, p.deviceId, p.userName||'', p.body||'', p.exTag||'', (p.userTags||[]).join(','), p.ts||'']);
        }
        result = { added: true };
        break;
      }

      case 'deletePost': {
        const sheet = getOrCreateSheet(ss, 'Posts',
          ['id','deviceId','userName','body','exTag','userTags','ts']);
        const data = sheetToObjects(sheet);
        const idx = data.findIndex(x => String(x.id) === String(body.id));
        if (idx >= 0) sheet.deleteRow(idx + 2);
        result = { deleted: true };
        break;
      }

      case 'addGlucose': {
        const sheet = getOrCreateSheet(ss, 'Glucose',
          ['id','deviceId','userName','value','timing','points','ts']);
        const p = payload;
        const data = sheetToObjects(sheet);
        if (!data.find(x => String(x.id) === String(p.id))) {
          sheet.appendRow([p.id, p.deviceId, p.userName||'', p.value||0, p.timing||'', p.points||0, p.ts||'']);
        }
        result = { added: true };
        break;
      }

      case 'addOrder': {
        const sheet = getOrCreateSheet(ss, 'Orders',
          ['id','deviceId','userName','name','phone','pickup','addr','items','total','status','orderedAt']);
        const p = payload;
        const data = sheetToObjects(sheet);
        if (!data.find(x => x.id === p.id)) {
          sheet.appendRow([p.id, p.deviceId, p.userName||'', p.name||'', p.phone||'', p.pickup||'', p.addr||'', typeof p.items === 'string' ? p.items : JSON.stringify(p.items||[]), p.total||0, p.status||'pending', p.orderedAt||'']);
        }
        result = { added: true };
        break;
      }

      case 'updateOrderStatus': {
        const sheet = getOrCreateSheet(ss, 'Orders',
          ['id','deviceId','userName','name','phone','pickup','addr','items','total','status','orderedAt']);
        const data = sheetToObjects(sheet);
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const statusCol = headers.indexOf('status') + 1;
        const idx = data.findIndex(o => o.id === body.id);
        if (idx >= 0 && statusCol > 0) sheet.getRange(idx + 2, statusCol).setValue(body.status);
        result = { updated: true };
        break;
      }

      case 'addRegistration': {
        const sheet = getOrCreateSheet(ss, 'Registrations',
          ['id','deviceId','empId','name','dept','phone','shoeSize','familyParticipation','familyCount','status','registeredAt']);
        const p = payload;
        const data = sheetToObjects(sheet);
        if (!data.find(x => x.id === p.id)) {
          sheet.appendRow([p.id, p.deviceId||'', p.empId||'', p.name||'', p.dept||'', p.phone||'', p.shoeSize||'', p.familyParticipation||false, p.familyCount||0, p.status||'pending', p.registeredAt||'']);
        }
        result = { added: true };
        break;
      }

      case 'updateRegistrationStatus': {
        const sheet = getOrCreateSheet(ss, 'Registrations',
          ['id','deviceId','empId','name','dept','phone','shoeSize','familyParticipation','familyCount','status','registeredAt']);
        const data = sheetToObjects(sheet);
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const statusCol = headers.indexOf('status') + 1;
        const idx = data.findIndex(r => r.id === body.id);
        if (idx >= 0 && statusCol > 0) sheet.getRange(idx + 2, statusCol).setValue(body.status);
        result = { updated: true };
        break;
      }

      case 'updateUserField': {
        const sheet = getOrCreateSheet(ss, 'Users',
          ['deviceId','name','avatar','empId','dept','points','streak','tags','registrationId','updatedAt']);
        const data = sheetToObjects(sheet);
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const idx = data.findIndex(u => u.deviceId === body.deviceId);
        if (idx >= 0) {
          Object.entries(body.updates).forEach(([key, val]) => {
            const col = headers.indexOf(key) + 1;
            if (col > 0) sheet.getRange(idx + 2, col).setValue(val);
          });
        }
        result = { updated: true };
        break;
      }

      default:
        result = { error: 'Unknown action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, ...result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
