import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import hu from './hu.json'

const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('hohplan:lang') : null

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hu: { translation: hu } },
  lng: saved ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export const setLanguage = (lng: 'en' | 'hu') => {
  localStorage.setItem('hohplan:lang', lng)
  void i18n.changeLanguage(lng)
}
export default i18n
