export type KnowledgeDocument = {id:string;title:string;source_type:string;content:string;status:string;embedding_status:string;updated_at:string};
export type Agent = {id:string;name:string;role:string;status:string;instructions:string;handoff_message:string;channels:string[]};
export type Preview = {answer:string;confidence:"grounded"|"limited"|"handoff";classification:"business_answer"|"clinical_handoff"|"urgent"|"no_source";sources:{id:string;title:string;sourceType:string;updatedAt:string}[];liveFacts:string[];safety:string};
export type SafetyResult = {question:string;expected:string;actual:string;passed:boolean};
