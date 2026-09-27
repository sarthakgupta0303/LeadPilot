-- Run after creating the user in Authentication → Users (Auto Confirm on)
-- and switching off "Allow new users to sign up".
-- Replace the email with the admin's login email.
insert into public.company_admins (user_id, company_id)
select u.id, c.id
from auth.users u
cross join public.companies c
where u.email = 'your-email@example.com'
  and c.name = 'Acme Cloud';
