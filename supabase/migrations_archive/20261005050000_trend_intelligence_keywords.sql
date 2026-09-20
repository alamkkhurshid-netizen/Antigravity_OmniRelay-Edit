-- Add search_query column to trend_intelligence_reports to support Keyword-Driven ScrapeGraphAI

alter table public.trend_intelligence_reports
add column search_query text;

-- We can make target_urls nullable or just leave it empty array if not used directly
alter table public.trend_intelligence_reports
alter column target_urls drop not null;
