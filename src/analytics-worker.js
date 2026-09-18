const {parentPort}=require('node:worker_threads');
const {loadAnalyticsReport}=require('./analytics');
parentPort.on('message',({id,options,activityOnly})=>{
  try {
    const report=loadAnalyticsReport(options);
    // If the cached snapshot expired, refresh the summary too so the UI never
    // combines new activity with old totals under a new generated-at timestamp.
    const data=activityOnly && options.snapshotAt===report.generatedAt?{ok:true,activity:report.activity,activityPagination:report.activityPagination,generatedAt:report.generatedAt}:report;
    parentPort.postMessage({id,data});
  } catch(error){parentPort.postMessage({id,error:error.message});}
});
