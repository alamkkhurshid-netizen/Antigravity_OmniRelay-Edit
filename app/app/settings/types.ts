export const categories = [
  "Healthcare", "Restaurants & hospitality", "Coaching & education",
  "Beauty & wellness", "Professional services", "Real estate",
  "Automotive services", "Retail & e-commerce", "Home services", "Other",
];

export type Address = { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string };
export type Location = { id?: string; name: string; location_type: string; phone?: string | null; google_maps_url?: string | null; timezone: string; address: Address; active?: boolean };
export type Service = { id?: string; name: string; service_type: string; duration_minutes: number; price_paise?: number | null; buffer_minutes?: number; description?: string | null; booking_enabled?: boolean; active?: boolean };
export type Resource = { id:string; name:string; resource_type:string; timezone:string; isNew?:boolean };
export type ProviderProfile = { resource_id:string; photo_path:string|null; specialization:string|null; qualifications:string|null; registration_number:string|null; experience_years:number|null; languages:string[]; biography:string|null; contact_phone:string|null; contact_email:string|null };
export type Department = {id:string;name:string;code:string|null;description:string|null;active:boolean;sort_order:number};

export const emptyProvider = (resourceId:string):ProviderProfile => ({resource_id:resourceId,photo_path:null,specialization:"",qualifications:"",registration_number:"",experience_years:null,languages:[],biography:"",contact_phone:"",contact_email:""});
