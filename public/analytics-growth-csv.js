(function(root){
 function parse(text){
  const rows=[];let row=[],value='',quoted=false,closed=false;
  const field=()=>{row.push(value);value='';closed=false;};
  const record=()=>{field();if(row.some(v=>v.trim()))rows.push(row);row=[];};
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
   if(c==='"'){if(value||closed)throw new Error('CSV quotes must enclose the whole field.');quoted=true;}
   else if(c===',')field();
   else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;record();}
   else {if(closed)throw new Error('Unexpected text after a quoted CSV field.');value+=c;}
  }
  if(quoted)throw new Error('CSV has an unclosed quoted field.');record();
  const headers=rows.shift()?.map(h=>h.replace(/^\uFEFF/,'').trim()),expected=['date','platform','source','visits','url','provenance'];
  if(!headers||headers.join(',')!==expected.join(','))throw new Error('Use the CSV template column names and order.');
  return rows.map((r,i)=>{if(r.length!==headers.length)throw new Error(`CSV row ${i+2} has the wrong number of columns.`);return Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));});
 }
 if(typeof module==='object'&&module.exports)module.exports={parse};else root.StreamGrowthCSV={parse};
})(globalThis);
