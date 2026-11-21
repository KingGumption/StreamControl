/* Report tabs share the same destinations on keyboard, mobile, and deep links. */
window.reportNavigation = function ({buttons, key, panel, activate, initial, label, picker}) {
  const tabs=Array.from(buttons), ids=tabs.map(key);
  const nav=tabs[0].parentElement;
  nav.setAttribute('role','tablist');nav.setAttribute('aria-label',label);
  const select=document.getElementById(picker);
  tabs.forEach((tab,i)=>{
    const id=ids[i], content=panel(id);
    tab.id=tab.id||'report-tab-'+id;
    if(!content.id)content.id='report-section-'+id;
    content.setAttribute('aria-labelledby',tab.id);content.setAttribute('role','tabpanel');
    tab.setAttribute('role','tab');tab.setAttribute('aria-controls',content.id);tab.removeAttribute('aria-pressed');
    select.add(new Option(tab.textContent,id));
    tab.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const to=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length;
      tabs[to].focus();tabs[to].click();
    });
  });
  select.addEventListener('change',()=>activate(select.value));
  function sync(id,push=true){
    if(!ids.includes(id))return;
    select.value=id;
    tabs.forEach((tab,i)=>{tab.tabIndex=ids[i]===id?0:-1;tab.setAttribute('aria-selected',String(ids[i]===id));});
    if(push && location.hash.slice(1)!==id && (location.hash || id!==initial)){
      const url=new URL(location.href);url.hash=id;history.pushState(null,'',url);
    }
  }
  const fromUrl=()=>ids.includes(location.hash.slice(1))?location.hash.slice(1):initial;
  addEventListener('hashchange',()=>activate(fromUrl()));
  return {sync,fromUrl};
};
