import { BookingManager } from "./booking-manager";

export const metadata = { title: "Manage appointment" };

export default async function ManageBookingPage({ searchParams }: { searchParams: Promise<{ reference?:string; token?:string }> }) {
  const params=await searchParams;
  return <BookingManager reference={params.reference??""} token={params.token??""}/>;
}
