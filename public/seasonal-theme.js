(()=>{const name=new URLSearchParams(location.search).get('theme');if(['halloween','ghost','slime'].includes(name))document.documentElement.dataset.theme=name;})();
