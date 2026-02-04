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
const K_SESSION  = "ma_session";   // { lineUserId, loginAt }
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

  const s = getLineSession();
  if(!s){
    el.innerHTML = `
      <a class="btn" href="login.html">LINEでログイン</a>
      <a class="btn primary" href="register.html">LINE連携で新規登録</a>
    `;
    return;
  }

  const m = getMember(s.lineUserId);
  const label = m?.displayName || "ログイン中";

  el.innerHTML = `
    <span class="badge">${escapeHtml(label)}</span>
    <a class="btn" href="member.html">会員ページ</a>
    <button class="btn" id="btnLogout">ログアウト</button>
  `;
  document.getElementById("btnLogout")?.addEventListener("click", logout);
}
document.addEventListener("DOMContentLoaded", renderHeaderAuth);

// ===== LINE / LIFF helpers =====
async function initLIFF(){
  if(!window.liff) return { ok:false, msg:"LIFF SDKが読み込まれていません" };
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
    liff.login();
    return { ok:false, msg:"LINEログインへ遷移します" };
  }
  return { ok:true };
}

async function getLineProfileSafe(){
  const profile = await liff.getProfile();
  return profile; // { userId, displayName, pictureUrl, statusMessage }
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