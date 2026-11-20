/**
 * الكلمات المشتركة بين كل الشاشات: الأفعال، مفردات النماذج، والقواعد التي
 * تلجأ إليها كل صفحة. القيم العربية هي ترجمة للقيم الإنجليزية لا إعادة صياغة
 * لها.
 */
const common = {
  actions: {
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    create: 'إنشاء',
    creating: 'جارٍ الإنشاء…',
    add: 'إضافة',
    edit: 'تعديل',
    archive: 'أرشفة',
    archived: 'مؤرشف',
    restore: 'استعادة',
    restored: 'تمت الاستعادة',
    remove: 'إزالة',
    delete: 'حذف',
    cancel: 'إلغاء',
    back: 'رجوع',
    close: 'إغلاق',
    confirm: 'تأكيد',
    search: 'بحث',
    retry: 'إعادة المحاولة',
    reset: 'إعادة الضبط',
    done: 'تم',
    view: 'عرض',
    loading: 'جارٍ التحميل…',
    next: 'التالي',
    previous: 'السابق',
    showTable: 'عرض كجدول',
    showChart: 'عرض كرسم بياني',
  },
  labels: {
    label: 'البند',
    value: 'القيمة',
  },
  form: {
    requiredMarker: '*',
    showArchived: 'إظهار المؤرشف',
    clearFilters: 'مسح الفلاتر',
  },
  loading: {
    generic: 'جارٍ التحميل…',
  },
  status: {
    active: 'نشط',
    archived: 'مؤرشف',
  },
};

export default common;
