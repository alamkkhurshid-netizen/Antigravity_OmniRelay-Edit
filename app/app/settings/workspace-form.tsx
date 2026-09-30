"use client";

import { ChamberScheduleEditor } from "./chamber-schedule-editor";
import { WorkspaceHero } from "@/components/workspace-hero";
import { useWorkspaceSettings } from "./use-workspace-settings";
import { BusinessProfileEditor } from "@/components/settings/business-profile-editor";
import { ClinicOperatingModel } from "@/components/settings/clinic-operating-model";
import { ProviderIdentityEditor } from "@/components/settings/provider-identity-editor";
import { LocationsEditor } from "@/components/settings/locations-editor";
import { ServicesEditor } from "@/components/settings/services-editor";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { RosterDispatchEditor } from "@/components/settings/roster-dispatch-editor";
import { Department, Location, ProviderProfile, Resource, Service } from "./types";

export function WorkspaceForm({ organization, profile, locations: initialLocations, services: initialServices, resources: initialResources, providerProfiles, assignments, assignmentServices, chamberRules, paymentGateway, departments: initialDepartments, providerDepartments, calendarConnections }: {
  organization: { id: string; name: string; extra: Record<string, unknown> | null };
  profile: Record<string, unknown> | null;
  locations: Location[];
  services: Service[];
  resources: Resource[];
  providerProfiles: ProviderProfile[];
  assignments: Array<{id:string;resource_id:string;location_id:string;active:boolean;effective_from:string;effective_to:string|null;booking_window_days:number}>;
  assignmentServices: Array<{assignment_id:string;service_id:string;active:boolean;duration_minutes:number|null;buffer_minutes:number|null;price_paise:number|null;payment_mode:"pay_at_location"|"full_online"|"deposit_online";allowed_payment_modes?:Array<"pay_at_location"|"full_online"|"deposit_online">;deposit_paise:number|null}>;
  chamberRules: Array<{id?:string;resource_id:string;location_id:string|null;weekday:number;start_time:string;end_time:string;slot_interval_minutes:number}>;
  paymentGateway: {provider:string;status:string;account_label:string|null;last_verified_at:string|null}|null;
  departments: Department[];
  providerDepartments: Array<{department_id:string;resource_id:string;primary_department:boolean}>;
  calendarConnections?: Array<{resource_id: string|null; expires_at: string}>;
}) {
  const state = useWorkspaceSettings(
    organization, profile, initialLocations, initialServices,
    initialResources, providerProfiles, initialDepartments, providerDepartments
  );

  return (
    <form className="foundation-form mx-auto grid max-w-7xl gap-5 pb-12" onSubmit={state.save}>
      <WorkspaceHero
        tag="WORKSPACE SETTINGS"
        title="Business setup"
        subtitle="Configure your business profile, providers, locations, and services."
      />

      <BusinessProfileEditor
        name={state.name} setName={state.setName}
        category={state.category} setCategory={state.setCategory}
        description={state.description} setDescription={state.setDescription}
        phone={state.phone} setPhone={state.setPhone}
        email={state.email} setEmail={state.setEmail}
        website={state.website} setWebsite={state.setWebsite}
        businessPhoneError={state.businessPhoneError} websiteError={state.websiteError}
      />

      <ClinicOperatingModel
        category={state.category} clinicMode={state.clinicMode} setClinicMode={state.setClinicMode}
        departments={state.departments} setDepartments={state.setDepartments}
      />

      <ProviderIdentityEditor
        category={state.category} resources={state.resources} providerId={state.providerId}
        chooseProvider={state.chooseProvider} addDoctor={state.addDoctor}
        photoPreview={state.photoPreview} provider={state.provider} uploadProviderPhoto={state.uploadProviderPhoto}
        renameProvider={state.renameProvider} setProvider={state.setProvider} clinicMode={state.clinicMode}
        departments={state.departments} providerDepartmentMap={state.providerDepartmentMap} setProviderDepartmentMap={state.setProviderDepartmentMap}
        customBrochureUrl={state.customBrochureUrl} setCustomBrochureUrl={state.setCustomBrochureUrl}
        brochureUrlError={state.brochureUrlError} uploadClinicBrochure={state.uploadClinicBrochure} customBrochurePath={state.customBrochurePath}
      />

      <LocationsEditor
        category={state.category} locations={state.locations} setLocations={state.setLocations}
        changeLocation={state.changeLocation} changeAddress={state.changeAddress}
      />

      <ServicesEditor
        services={state.services} setServices={state.setServices} changeService={state.changeService}
      />

      <ChamberScheduleEditor organizationId={organization.id} category={state.category} resources={state.resources} locations={state.locations} services={state.services} assignments={assignments} assignmentServices={assignmentServices} chamberRules={chamberRules} paymentGateway={paymentGateway} calendarConnections={calendarConnections} />

      <IntegrationsPanel
        category={state.category} calendarConnections={calendarConnections} organizationId={state.organizationId}
      />

      <RosterDispatchEditor
        category={state.category} dispatchEnabled={state.dispatchEnabled} setDispatchEnabled={state.setDispatchEnabled}
        dispatchTime={state.dispatchTime} setDispatchTime={state.setDispatchTime} dispatchClinicEmail={state.dispatchClinicEmail}
        setDispatchClinicEmail={state.setDispatchClinicEmail} email={state.email} sendToClinic={state.sendToClinic}
        setSendToClinic={state.setSendToClinic} sendToDoctors={state.sendToDoctors} setSendToDoctors={state.setSendToDoctors}
        dispatchingTest={state.dispatchingTest} testDispatch={state.testDispatch} dispatchNotice={state.dispatchNotice}
      />

      <div className="save-bar">
        <div>
          <b>Workspace foundation</b>
          <span>Used by appointments, AI agents and automations</span>
        </div>
        <button className="primary-button" disabled={state.busy}>{state.busy ? "Saving…" : "Save business setup"}</button>
      </div>
      {state.message && <p className="form-message" role="status">{state.message}</p>}
    </form>
  );
}
