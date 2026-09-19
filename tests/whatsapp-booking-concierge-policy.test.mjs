import assert from "node:assert/strict";
import test from "node:test";
import {bookingMenu,choiceList,isRepeatableAppointment,nextSevenDates,replyButtons} from "../supabase/functions/whatsapp-booking-concierge/policy.mjs";

test("personalizes the returning-patient menu without exposing medical data",()=>{
  const menu=bookingMenu("Welcome","Raja");
  assert.match(menu,/Welcome back, Raja/);
  assert.match(menu,/Repeat my last appointment/);
  assert.match(menu,/Doctor directory & brochure/);
  assert.match(menu,/Clinic timings & location/);
  assert.match(menu,/Speak to front desk/);
  assert.doesNotMatch(menu,/Quick booking/);
  assert.doesNotMatch(menu,/disease|prescription content|diagnosis/i);
});
test("new patients do not see a misleading repeat option",()=>{
  assert.doesNotMatch(bookingMenu("Welcome"),/Repeat my last appointment/);
  assert.match(bookingMenu("Welcome"),/Doctor directory & brochure/);
});
test("only complete previous appointments can be repeated",()=>{
  assert.equal(isRepeatableAppointment({service:{id:"s"},location:{id:"l"},resource:{id:"r"}}),true);
  assert.equal(isRepeatableAppointment({service:{id:"s"},location:null,resource:{id:"r"}}),false);
});
test("offers seven future dates",()=>{
  assert.deepEqual(nextSevenDates(Date.parse("2026-08-03T00:00:00Z")),["2026-08-04","2026-08-05","2026-08-06","2026-08-07","2026-08-08","2026-08-09","2026-08-10"]);
});
test("reply buttons stay within Meta limits and preserve numeric state ids",()=>{
  const message=replyButtons("Confirm booking?",[{id:"1",title:"Confirm"},{id:"2",title:"Cancel"}]);
  assert.equal(message.type,"button");
  assert.deepEqual(message.action.buttons.map((button)=>button.reply.id),["1","2"]);
  assert.equal(replyButtons("Too many",[1,2,3,4].map((id)=>({id:String(id),title:String(id)}))),null);
});
test("choice lists support up to ten options and fall back above the limit",()=>{
  const rows=Array.from({length:10},(_,index)=>({id:String(index+1),title:`Option ${index+1}`}));
  assert.equal(choiceList("Choose","Open menu",rows).action.sections[0].rows.length,10);
  assert.equal(choiceList("Choose","Open menu",[...rows,{id:"11",title:"Option 11"}]),null);
});
