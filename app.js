/* app.js - Serenes simple app core (session + board + helpers + LINE/GAS)
   localStorage で動く、ファイルだけで完結する版
*/

/* =============================================
   ⚙️ 重要設定
   ============================================= */
const MY_LIFF_ID = "2006846780-ojjmzQx9"; 

// ↓ GASのウェブアプリURL
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbx79zOLPWQ85wu_qS4uWAsDJKV8uWr35eLK21IaHd6jfe6XRS1Di-nCudb45t5eaEy-GA/exec";
/* ============================================= */


/* ===== HTML Escape ===== */
window.escapeHtml = function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
};

/* ===== Popup (optional) ===== */
window.showPopup = window.showPopup || function(body, title){
  const pop = document.getElementById("popup");
  const t = document.getElementById("popupTitle");
  const b = document.getElementById("popupBody");
  const c = document.getElementById("popupClose");
  if(!pop || !t || !b) { alert((title?title+"\n":"") + body); return; }
  t.textContent = title || "お知らせ";
  b.innerHTML = body || "";
  pop.style.display = "block";
  if(c){
    c.onclick = ()=> (pop.style.display = "none");
  }
};

/* ===== Member Session ===== */
const SESSION_KEYS = ["ma_member_session", "member_session", "ma_session"];

window.getMemberSession = function getMemberSession(){
  for(const k of SESSION_KEYS){
    try{
      const obj = JSON.parse(localStorage.getItem(k) || "null");
      if(obj && obj.memberId) return obj;
    }catch(e){}
  }
  return null;
};

window.setMemberSession = function setMemberSession(sessionObj){
  localStorage.setItem("ma_member_session", JSON.stringify(sessionObj || {}));
};

window.clearMemberSession = function clearMemberSession(){
  for(const k of SESSION_KEYS){
    localStorage.removeItem(k);
  }
};

/* ===== Admin (optional) ===== */
window.isAdminUser = window.isAdminUser || function isAdminUser(memberId){
  return false;
};

/* ===== LIFF (LINE連携) Functions ===== */
window.initLIFF = async function(){
  if(!window.liff){ 
    return {ok:false, msg:"LIFF SDKがロードされていません。インターネット接続を確認してください。"}; 
  }
  try{
    if(!MY_LIFF_ID || MY_LIFF_ID.includes("YOUR_LIFF_ID")){
      return {ok:false, msg:"LIFF IDが正しく設定されていません。"};
    }
    await liff.init({ liffId: MY_LIFF_ID });
    return {ok:true};
  }catch(e){
    console.error("LIFF Init Error:", e);
    return {ok:false, msg: "LIFF初期化エラー: " + e.message};
  }
};

window.getLineProfileSafe = async function(){
  try{
    const p = await liff.getProfile();
    return p;
  }catch(e){
    console.error(e);
    return {userId:"", displayName:""};
  }
};

/* ===== GAS API (申請送信のみ) ===== */
window.gasApply = async function(data){
  if(!GAS_API_URL){
    console.warn("GAS_API_URL is missing");
    return;
  }
  const url = new URL(GAS_API_URL);
  url.searchParams.append("action", "register");
  url.searchParams.append("lineUserId", data.lineUserId || "");
  url.searchParams.append("displayName", data.displayName || "");
  url.searchParams.append("name", data.name || "");
  url.searchParams.append("age", data.age || "");
  url.searchParams.append("phone", data.phone || "");
  
  // no-corsで送信
  await fetch(url.toString(), {mode: 'no-cors'});
  return true; 
};


/* ===== Board Storage ===== */
const POST_KEY = "ma_board_posts_v1";
const REPLY_KEY = "ma_board_replies_v1";

function _load(key){
  try{ return JSON.parse(localStorage.getItem(key) || "[]"); }catch(e){ return []; }
}
function _save(key, arr){
  localStorage.setItem(key, JSON.stringify(arr || []));
}
function _now(){
  return new Date().toLocaleString();
}
function _uid(){
  return "id_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
}

/* ===== Posts API ===== */
window.listPosts = function listPosts(){
  const posts = _load(POST_KEY);
  posts.sort((a,b)=> (b.createdAtEpoch||0) - (a.createdAtEpoch||0));
  return posts;
};

window.addPost = function addPost(memberId, title, body){
  const posts = _load(POST_KEY);
  const p = {
    id: _uid(),
    lineUserId: String(memberId||""),
    title: String(title||""),
    body: String(body||""),
    createdAt: _now(),
    createdAtEpoch: Date.now()
  };
  posts.push(p);
  _save(POST_KEY, posts);
  return p;
};

window.deletePost = function deletePost(postId, byMemberId){
  const posts = _load(POST_KEY);
  const idx = posts.findIndex(p => String(p.id) === String(postId));
  if(idx === -1) return false;

  const post = posts[idx];
  const isOwner = String(post.lineUserId) === String(byMemberId);
  const isAdmin = window.isAdminUser(byMemberId);

  if(!isOwner && !isAdmin) return false;

  posts.splice(idx,1);
  _save(POST_KEY, posts);

  const replies = _load(REPLY_KEY).filter(r => String(r.postId) !== String(postId));
  _save(REPLY_KEY, replies);

  return true;
};

/* ===== Replies API ===== */
window.listReplies = function listReplies(postId){
  const replies = _load(REPLY_KEY);
  const filtered = postId ? replies.filter(r => String(r.postId) === String(postId)) : replies;
  filtered.sort((a,b)=> (a.createdAtEpoch||0) - (b.createdAtEpoch||0));
  return filtered;
};

window.addReply = function addReply(postId, memberId, body, replyTo){
  const replies = _load(REPLY_KEY);
  const r = {
    id: _uid(),
    postId: String(postId||""),
    lineUserId: String(memberId||""),
    body: String(body||""),
    createdAt: _now(),
    createdAtEpoch: Date.now(),
    replyTo: replyTo || null
  };
  replies.push(r);
  _save(REPLY_KEY, replies);
  return r;
};

window.deleteReply = function deleteReply(replyId, byMemberId){
  const replies = _load(REPLY_KEY);
  const idx = replies.findIndex(r => String(r.id) === String(replyId));
  if(idx === -1) return false;

  const r = replies[idx];
  const isOwner = String(r.lineUserId) === String(byMemberId);
  const isAdmin = window.isAdminUser(byMemberId);

  if(!isOwner && !isAdmin) return false;

  replies.splice(idx, 1);
  _save(REPLY_KEY, replies);
  return true;
};

/* ===== UI auth slot fill ===== */
document.addEventListener("DOMContentLoaded", ()=>{
  const slot = document.querySelector("[data-auth]");
  if(!slot) return;

  const ms = window.getMemberSession();
  if(ms && ms.memberId){
    slot.innerHTML = `
      <span class="small">ID: ${window.escapeHtml(ms.memberId)}</span>
      <a class="btn ghost" href="member.html">会員</a>
      <button class="btn ghost" type="button" id="btnLogout">ログアウト</button>
    `;
    const btn = document.getElementById("btnLogout");
    if(btn){
      btn.onclick = ()=>{
        window.clearMemberSession();
        location.replace("login.html");
      };
    }
  }else{
    slot.innerHTML = `<a class="btn primary" href="login.html">ログイン</a>`;
  }
});