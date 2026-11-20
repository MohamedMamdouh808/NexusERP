/** لوحة صحة النظام. */
const health = {
  title: 'صحة النظام',
  loading: 'جارٍ تحميل تقرير صحة النظام',
  loadError: 'تعذرت قراءة تقرير صحة النظام.',
  tryAgain: 'تحقق مرة أخرى',
  retryAfter_one: 'طلبات كثيرة. حاول مرة أخرى خلال ثانية واحدة.',
  retryAfter_other: 'طلبات كثيرة. حاول مرة أخرى خلال {{count}} ثانية.',
  requestId: 'معرّف الطلب: ',
  healthy: 'بصحة جيدة',
  uptime: 'مدة التشغيل {{seconds}} ثانية',
  application: 'التطبيق',
  database: 'قاعدة البيانات',
  unavailable: 'غير متاحة',
};

export default health;
