// ===== Basic storage helpers =====
const nowISO = () => new Date().toISOString();

function load(key, fallback){
  try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch(e){ return fallback; }
}
function save(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

// ===== Keys =====
const K_SESSION  = "ma_session";   // { lineUserId, loginAt }   ※LINEセッション（使う場合のみ）
const K_MEMBERS  = "ma_members";   // { [lineUserId]: {lineUserId, displayName, name, age, phone, createdAt} }
const K_PROFILE  = "ma_profile";   // { [lineUserId]: {bio, area, contact, updatedAt...} }
const K_BOARD    = "ma_board_posts"; // [{id, lineUserId, title, body, createdAt}]

// ===== Session =====
function getSession(){ return load(K_SESSION, null); }

function setLineSession(lineUserId){
  save(K_SESSION, { lineUserId, loginAt: nowISO() });
}
function getLineSession(){
  const s = getSession();
  if(!s || !s.lineUserId) return null;
  return s;
}
function requireLineLogin(){
  const s = getLineSession();
  if(!s){
    alert("ログインが必要です");
    location.href = "login.html";
    return null;
  }
  return s;
}
function logout(){
  localStorage.removeItem(K_SESSION);
  location.href = "index.html";
}

// ===== Members =====
function upsertMember(member){
  const all = load(K_MEMBERS, {});
  all[member.lineUserId] = member;
  save(K_MEMBERS, all);
}
function getMember(lineUserId){
  const all = load(K_MEMBERS, {});
  return all[lineUserId] ?? null;
}

// ===== Profile (detail) =====
function loadProfile(lineUserId){
  const all = load(K_PROFILE, {});
  return all[lineUserId] ?? null;
}
function saveProfile(lineUserId, profile){
  const all = load(K_PROFILE, {});
  all[lineUserId] = { ...(all[lineUserId]||{}), ...profile, updatedAt: nowISO() };
  save(K_PROFILE, all);
}

// ===== Board =====
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function listPosts(){
  return load(K_BOARD, []).sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||""));
}
function addPost(lineUserId, title, body){
  const posts = load(K_BOARD, []);
  posts.push({ id: uid(), lineUserId, title, body, createdAt: nowISO() });
  save(K_BOARD, posts);
}
function deletePost(id, lineUserId){
  const posts = load(K_BOARD, []);
  const next = posts.filter(p => !(p.id === id && p.lineUserId === lineUserId));
  save(K_BOARD, next);
}

// ===== UI helpers =====
function escapeHtml(str){
  return (str ?? "").replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function renderHeaderAuth(){
  const el = document.querySelector("[data-auth]");
  if(!el) return;

  // ※ログイン条件からLINEを外したので、ヘッダーはシンプルでOK
  // （必要なら「ログイン中表示」など後で作り込めます）
  el.innerHTML = `
    <a class="btn" href="login.html">ログイン</a>
    <a class="btn primary" href="register.html">新規登録（申請）</a>
  `;
}
document.addEventListener("DOMContentLoaded", renderHeaderAuth);

// ===== LINE / LIFF helpers =====
// ※registerでLINE連携を使う場合のみ必要（loginがLINE不要でも残してOK）
async function initLIFF(){
  if(!window.liff) return { ok:false, msg:"LIFF SDKが読み込まれていません" };
  if(typeof LIFF_ID === "undefined" || !LIFF_ID){
    return { ok:false, msg:"LIFF_ID が未設定です（liff-config.js を確認）" };
  }
  try{
    await liff.init({ liffId: LIFF_ID });
    return { ok:true };
  }catch(e){
    console.error(e);
    return { ok:false, msg:"LIFF初期化に失敗しました（Endpoint URLやLIFF IDを確認）" };
  }
}

async function ensureLineLogin(){
  const r = await initLIFF();
  if(!r.ok) return r;

  if(!liff.isLoggedIn()){
    const cleanUrl = location.origin + location.pathname; // 400回避
    liff.login({ redirectUri: cleanUrl });
    return { ok:false, msg:"LINEログインへ遷移します" };
  }
  return { ok:true };
}

async function getLineProfileSafe(){
  const profile = await liff.getProfile();
  return profile; // { userId, displayName, pictureUrl, statusMessage }
}

async function safeLiffLogout(){
  try{
    if(window.liff && liff.isLoggedIn && liff.isLoggedIn()){
      liff.logout();
    }
  }catch(e){
    console.warn("LIFF logout failed", e);
  }
}

// ===== Replies (thread + @mention) =====
const K_REPLIES = "ma_board_replies"; // [{id, postId, lineUserId, body, replyTo:{name, lineUserId, replyId}, createdAt}]

function listReplies(postId){
  const all = load(K_REPLIES, []);
  return all
    .filter(r => r.postId === postId)
    .sort((a,b)=> (a.createdAt||"").localeCompare(b.createdAt||"")); // 古い→新しい
}

function addReply(postId, lineUserId, body, replyTo){
  const replies = load(K_REPLIES, []);
  replies.push({
    id: uid(),
    postId,
    lineUserId,
    body,
    replyTo: replyTo || null, // {name, lineUserId, replyId}
    createdAt: nowISO()
  });
  save(K_REPLIES, replies);
}

function deleteReply(replyId, lineUserId){
  const replies = load(K_REPLIES, []);
  const next = replies.filter(r => !(r.id === replyId && r.lineUserId === lineUserId));
  save(K_REPLIES, next);
}

// ===== Application / Approval registry =====
const K_APPLY = "ma_applications";
const K_APPROVED = "ma_approved";
const K_MEMBER_SESSION = "ma_member_session";

function getApplication(lineUserId){
  const all = load(K_APPLY, {});
  return all[lineUserId] ?? null;
}
function setApplication(app){
  const all = load(K_APPLY, {});
  all[app.lineUserId] = app;
  save(K_APPLY, all);
}

function getApproved(lineUserId){
  const all = load(K_APPROVED, {});
  return all[lineUserId] ?? null;
}
function setApproved(approved){
  const all = load(K_APPROVED, {});
  all[approved.lineUserId] = approved;
  save(K_APPROVED, all);
}

function setMemberSession(lineUserId, memberId){
  save(K_MEMBER_SESSION, { lineUserId, memberId, loginAt: nowISO() });
}
function getMemberSession(){
  return load(K_MEMBER_SESSION, null);
}
function clearMemberSession(){
  localStorage.removeItem(K_MEMBER_SESSION);
}

// ===== GAS API（JSONP）=====
const GAS_URL = "https://script.google.com/macros/s/AKfycbx79zOLPWQ85wu_qS4uWAsDJKV8uWr35eLK21IaHd6jfe6XRS1Di-nCudb45t5eaEy-GA/exec";

function jsonp(url){
  return new Promise((resolve, reject)=>{
    const cb = "cb_" + Math.random().toString(36).slice(2);
    window[cb] = (data)=>{
      try{ delete window[cb]; }catch(_){}
      script.remove();
      resolve(data);
    };
    const script = document.createElement("script");
    script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
    script.onerror = ()=>{
      try{ delete window[cb]; }catch(_){}
      script.remove();
      reject(new Error("jsonp_failed"));
    };
    document.body.appendChild(script);
  });
}

function gasUrl(action, params={}){
  const u = new URL(GAS_URL);
  u.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k, v));
  return u.toString();
}

// 申請（LINE連携で使うなら）
async function gasApply(app){
  return await jsonp(gasUrl("apply", app));
}

// 状態確認（LINE連携で使うなら）
async function gasStatus(lineUserId){
  return await jsonp(gasUrl("status", { lineUserId }));
}

// 承認済み照合（LINE連携 + memberId + pin）
async function gasVerify(lineUserId, memberId, pin){
  return await jsonp(gasUrl("verify", { lineUserId, memberId, pin }));
}

// ★LINE不要ログイン（memberId + name + age + phone）
async function gasLogin(memberId, name, age, phone){
  return await jsonp(gasUrl("login", { memberId, name, age, phone }));
}

// ===== 会員IDログイン（LINE不要）=====
async function gasLogin(memberId, name, age, phone){
  return await jsonp(gasUrl("login", {
    memberId,
    name,
    age,
    phone
  }));
}