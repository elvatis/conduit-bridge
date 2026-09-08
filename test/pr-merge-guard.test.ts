import {describe,it,expect} from 'vitest';
import {mergeBlockers} from '../scripts/check-pr-merge.mjs';

const ready=()=>({state:'OPEN',isDraft:false,title:'Switch license to MIT',labels:[],headRefOid:'a'.repeat(40),statusCheckRollup:[{name:'Test',status:'COMPLETED',conclusion:'SUCCESS'}]});
describe('PR merge preflight',()=>{
  it('blocks human holds at the end of long titles and on any label',()=>{
    expect(mergeBlockers({...ready(),title:'A'.repeat(220)+' [NICHT MERGEN]'}).some(reason=>reason.startsWith('Human hold:'))).toBe(true);
    expect(mergeBlockers({...ready(),labels:[{name:'reviewed'},{name:'needs-human-evidence'}]}).some(reason=>reason.startsWith('Human hold:'))).toBe(true);
    expect(mergeBlockers({...ready(),isDraft:true})).not.toEqual([]);
  });
  it('requires checked commit identity and successful check data',()=>{
    expect(mergeBlockers(ready())).toEqual([]);
    expect(mergeBlockers({...ready(),statusCheckRollup:[]})).not.toEqual([]);
    expect(mergeBlockers({...ready(),headRefOid:''})).not.toEqual([]);
    expect(mergeBlockers({...ready(),statusCheckRollup:[{name:'Tests',status:'IN_PROGRESS',conclusion:''}]})).not.toEqual([]);
  });
});
