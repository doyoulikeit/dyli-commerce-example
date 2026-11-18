import test from 'node:test';
import assert from 'node:assert/strict';
import { drawDemoPulls } from '../src/lib/demo-pulls.ts';
const item={price:15,brand:'Pokémon',raw:{buyback_rate:.85}};
const data={ranges:{ranges:[{range_name:'Common',rate:90,items:[{token_id:1,name:'Unavailable',qty_in_box:0},{token_id:2,name:'Common card',qty_in_box:3,box_price:10,buyback_price:0}]},{range_name:'Rare',rate:10,items:[{token_id:3,name:'Rare card',qty_in_box:1,box_price:100}]}]}};

test('guest pulls use published range weights and available units, preserving zero buybacks',()=>{
  const common=drawDemoPulls(data,item,2,()=>0);
  assert.equal(common.length,2);assert.equal(common[0].name,'Common card');assert.equal(common[0].tier,'Common');assert.equal(common[0].buyback,0);
  const rare=drawDemoPulls(data,item,1,()=>.999)[0];assert.equal(rare.name,'Rare card');assert.equal(rare.tier,'Rare');assert.equal(rare.buyback,85);
  assert.equal(data.ranges.ranges[0].items[1].qty_in_box,3,'simulation never decrements live stock');
});

test('invalid quantities and missing public inventory cannot create demo purchases',()=>{
 for(const quantity of [0,11,1.5,NaN])assert.throws(()=>drawDemoPulls(data,item,quantity),/1 and 10/);
 assert.throws(()=>drawDemoPulls({ranges:{ranges:[]}},item,1),/Try another pack/);
});
