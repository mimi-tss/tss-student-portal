-- One Stripe customer can pay for more than one student — confirmed
-- live: a mother and daughter (Cassi and Michele Garabedian) are both
-- students billed on one Opus customer. 0097 made stripe_customer_id
-- unique, so the second could never be linked. The plain index
-- (students_stripe_customer_id_idx, 0097) stays for lookups. The Stripe
-- webhook now matches events by stripe_subscription_id first, so two
-- students on one customer each follow their own subscription.
alter table students drop constraint if exists students_stripe_customer_id_key;
