export interface FaqCategory {
  id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface FaqItem {
  id: string
  category_id: string
  question: string
  answer: string
  sort_order: number
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface FaqCategoryWithItems extends FaqCategory {
  items: FaqItem[]
}
