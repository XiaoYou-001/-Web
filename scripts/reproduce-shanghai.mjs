import { createAiItineraryService } from '../src/services/aiItineraryService.js'
import { createApiClient } from '../src/services/apiClient.js'
import { writeFile } from 'node:fs/promises'
const client=createApiClient({baseUrl:'http://127.0.0.1:5175/api'})
const service=createAiItineraryService({async request(...args){const data=await client.request(...args);await writeFile('.local-evidence/shanghai-raw.json',JSON.stringify(data,null,2));console.log(JSON.stringify({finish:data.choices?.[0]?.finish_reason,usage:data.usage,content:data.choices?.[0]?.message?.content}));return data}})
try {const result=await service.generate({destination:'上海',startDate:'2026-10-30',endDate:'2026-10-31',budget:900,persons:2,preferences:['art','shopping'],pace:'normal'});console.log('PASS',result.days.length)}catch(e){console.log('FAIL',e.message);process.exitCode=1}
