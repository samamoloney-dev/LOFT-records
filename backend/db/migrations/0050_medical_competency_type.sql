-- Medical certificate expiry, tracked the same way as the other competency
-- types (Dangerous Goods, First Aid, etc. - see 0037) rather than as its own
-- special-cased field, since it's just another date-with-expiry per crew member.
INSERT INTO competency_types (name, sort_order) VALUES ('Medical', 9);
