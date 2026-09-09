/** `overlay-petshop` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'overlay-petshop'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'brand': '毛小馆',
  'kicker': '洗剪吹预约',
  'headline': '给毛孩子预约一套洗剪吹',
  'blurb': '选套餐和时段，填小狗小名。确认后会打到后端插件，写入预约库成功才会显示预约成功。',
  'nav.packages': '套餐',
  'nav.book': '预约',
  'packages.title': '今日套餐',
  'pkg.bath.name': '清爽洗护',
  'pkg.bath.blurb': '洗澡、吹干、耳朵清洁，适合定期保养。',
  'pkg.bath.price': '168',
  'pkg.cut.name': '洗剪吹',
  'pkg.cut.blurb': '洗澡加造型修剪，店里最常约的一套。',
  'pkg.cut.price': '268',
  'pkg.full.name': '精致造型',
  'pkg.full.blurb': '洗剪吹加造型喷护，出门拍照也够用。',
  'pkg.full.price': '368',
  'form.title': '为你家狗狗下单',
  'form.dog': '狗狗小名',
  'form.breed': '品种',
  'form.owner': '家长称呼',
  'form.phone': '手机号',
  'form.slot': '到店时段',
  'form.submit': '确认预约',
  'form.sending': '正在提交…',
  'form.error.required': '请把带星号的项填完，并选套餐和时段。',
  'form.error.phone': '请填写有效的大陆手机号。',
  'form.error.rpc': '预约没有写进库，请再试一次。',
  'booked.title': '预约成功',
  'booked.body': '{dog} 的 {pkg} 已排在 {slot}。编号 {id}',
  'booked.reset': '再约一单',
}

/** English dictionary (same key set). */
export const en: Record<OverlayPetshopKey, string> = {
  'brand': 'Mao Xiao Guan',
  'kicker': 'Grooming booking',
  'headline': 'Book a wash, cut and blow for your dog',
  'blurb': 'Pick a package and slot, then name the dog. Confirm posts to the hub plugin; success shows only after the store write acks.',
  'nav.packages': 'Packages',
  'nav.book': 'Book',
  'packages.title': 'Today’s packages',
  'pkg.bath.name': 'Fresh bath',
  'pkg.bath.blurb': 'Bath, dry, and ear clean for regular upkeep.',
  'pkg.cut.name': 'Wash, cut & blow',
  'pkg.cut.blurb': 'Bath plus a trim — the usual booking.',
  'pkg.cut.price': '268',
  'pkg.full.name': 'Full style',
  'pkg.full.blurb': 'Wash, cut, blow, and finish spray for photos.',
  'pkg.full.price': '368',
  'pkg.bath.price': '168',
  'form.title': 'Book for your dog',
  'form.dog': 'Dog’s name',
  'form.breed': 'Breed',
  'form.owner': 'Owner name',
  'form.phone': 'Mobile number',
  'form.slot': 'Arrival slot',
  'form.submit': 'Confirm booking',
  'form.sending': 'Sending…',
  'form.error.required': 'Fill the starred fields and pick a package and slot.',
  'form.error.phone': 'Enter a valid mainland mobile number.',
  'form.error.rpc': 'The store did not accept this booking. Try again.',
  'booked.title': 'Booking confirmed',
  'booked.body': '{dog} is booked for {pkg} at {slot}. Id {id}',
  'booked.reset': 'Book another',
}

/** Union of this namespace's dictionary keys. */
export type OverlayPetshopKey = keyof typeof zh
