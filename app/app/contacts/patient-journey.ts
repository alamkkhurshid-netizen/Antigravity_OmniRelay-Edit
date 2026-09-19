export type PatientJourneyInput = {
  hasPhone:boolean;hasAge:boolean;hasHealthConcern:boolean;hasLocation:boolean;hasPincode:boolean;
  careConsent:boolean;encounterCount:number;prescriptionCount:number;documentCount:number;
  activeFollowUpCount:number;openTaskCount:number;activeCarePlanCount:number;
};

export type PatientJourneyStep = {
  key:"profile"|"visit"|"care_record"|"care_plan"|"consent";label:string;complete:boolean;
};

export type PatientJourneyStatus = {
  steps:PatientJourneyStep[];completed:number;total:number;percent:number;ready:boolean;
  nextAction:"Complete profile"|"Record visit"|"Add prescription or document"|"Set follow-up or task"|"Capture care consent"|"Ready";
};

export function getPatientJourneyStatus(input:PatientJourneyInput):PatientJourneyStatus {
  const profileComplete=input.hasPhone&&input.hasAge&&input.hasHealthConcern&&input.hasLocation&&input.hasPincode;
  const visitComplete=input.encounterCount>0;
  const careRecordComplete=input.prescriptionCount>0||input.documentCount>0;
  const carePlanComplete=input.activeCarePlanCount>0||input.activeFollowUpCount>0||input.openTaskCount>0;
  const steps:PatientJourneyStep[]=[
    {key:"profile",label:"Profile",complete:profileComplete},
    {key:"visit",label:"Visit",complete:visitComplete},
    {key:"care_record",label:"Care record",complete:careRecordComplete},
    {key:"care_plan",label:"Next action",complete:carePlanComplete},
    {key:"consent",label:"Consent",complete:input.careConsent},
  ];
  const completed=steps.filter((step)=>step.complete).length;
  const nextAction=!profileComplete?"Complete profile"
    :!visitComplete?"Record visit"
    :!careRecordComplete?"Add prescription or document"
    :!carePlanComplete?"Set follow-up or task"
    :!input.careConsent?"Capture care consent"
    :"Ready";
  return {steps,completed,total:steps.length,percent:Math.round((completed/steps.length)*100),ready:completed===steps.length,nextAction};
}
