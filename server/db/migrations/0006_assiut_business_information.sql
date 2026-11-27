UPDATE website_settings
SET setting_value = 'Assiut, Egypt',
    updated_at = now()
WHERE setting_key = 'store.address_en'
  AND setting_value = 'Cairo, Egypt';
--> statement-breakpoint

UPDATE website_settings
SET setting_value = 'أسيوط، مصر',
    updated_at = now()
WHERE setting_key = 'store.address_ar'
  AND setting_value = 'القاهرة، مصر';
--> statement-breakpoint

UPDATE website_settings
SET setting_value = 'Saturday to Thursday: 8:00 AM – 8:00 PM. Friday: Closed.',
    updated_at = now()
WHERE setting_key = 'store.support_hours_en'
  AND setting_value = 'Saturday – Thursday, 10:00 AM – 8:00 PM (Cairo Time)';
--> statement-breakpoint

UPDATE website_settings
SET setting_value = 'من السبت إلى الخميس: من 8 صباحًا حتى 8 مساءً. الجمعة: مغلق.',
    updated_at = now()
WHERE setting_key = 'store.support_hours_ar'
  AND setting_value = 'السبت – الخميس، 10:00 صباحاً – 8:00 مساءً (بتوقيت القاهرة)';
--> statement-breakpoint

UPDATE website_content
SET title_en = 'Assiut Client Care',
    updated_at = now()
WHERE content_key = 'contact'
  AND title_en = 'Cairo Studio & Client Care';
--> statement-breakpoint

UPDATE website_content
SET title_ar = 'خدمة عملاء أسيوط',
    updated_at = now()
WHERE content_key = 'contact'
  AND title_ar = 'استوديو القاهرة وخدمة العملاء';
--> statement-breakpoint

UPDATE website_content
SET body_en = 'Reach out to our client care team in Assiut for sizing advice, governorate delivery estimates, or Cash on Delivery order support.',
    updated_at = now()
WHERE content_key = 'contact'
  AND body_en = 'Reach out to our Cairo client care team for sizing advice, governorate delivery estimates, or Cash on Delivery order support.';
--> statement-breakpoint

UPDATE website_content
SET body_ar = 'تواصل مع فريق خدمة العملاء في أسيوط لأي استفسار حول المقاسات أو مواعيد التوصيل للمحافظات أو طلبات الدفع عند الاستلام.',
    updated_at = now()
WHERE content_key = 'contact'
  AND body_ar = 'تواصل مع فريق خدمة العملاء في القاهرة لأي استفسار حول المقاسات أو مواعيد التوصيل للمحافظات أو طلبات الدفع عند الاستلام.';
--> statement-breakpoint

UPDATE website_content
SET title_en = 'Built in Assiut. Cut with quiet permanence.',
    updated_at = now()
WHERE content_key = 'about'
  AND title_en = 'Built in Cairo. Cut with quiet permanence.';
--> statement-breakpoint

UPDATE website_content
SET title_ar = 'صُمم في أسيوط. بقصّة هادئة تدوم طويلاً.',
    updated_at = now()
WHERE content_key = 'about'
  AND title_ar = 'صُمم في القاهرة. بقصّة هادئة تدوم طويلاً.';
