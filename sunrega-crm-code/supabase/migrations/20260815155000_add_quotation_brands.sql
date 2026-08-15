alter table public.quotations
  add column if not exists basic_panel_brand text not null default 'Premier Energies',
  add column if not exists premium_panel_brand text not null default 'Waaree Energies',
  add column if not exists basic_inverter_brand text not null default 'Sungrow',
  add column if not exists premium_inverter_brand text not null default 'Deye';

notify pgrst, 'reload schema';
