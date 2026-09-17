with seed_posts (category_slug, title, slug, description, content, image, post_date) as (
  values
    (
      'training',
      'Build a Simple Three-Day Strength Routine',
      'build-a-simple-three-day-strength-routine',
      'A practical weekly template for keeping your training organized and consistent.',
      $content$## 1. Plan Your Training Days
Choose three days that fit your schedule and leave room between sessions.
Keep a training log so you can compare your sessions over time.

## 2. Keep the Routine Repeatable
Build each session around a few familiar movements and record your sets and repetitions.
- Prepare your equipment before starting.
- Review your log before the next session.$content$,
      'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=1000&q=80',
      date '2026-09-15'
    ),
    (
      'nutrition',
      'Meal Prep Without Spending Your Whole Sunday',
      'meal-prep-without-spending-your-whole-sunday',
      'Organize a small collection of ingredients to make weekday meals easier to assemble.',
      $content$## 1. Start With Your Schedule
Count the meals you want to prepare and choose recipes that share ingredients.
Write a shopping list before heading to the store.

## 2. Assemble as You Go
Keep components organized so you can mix and match meals during the week.
- Label your containers.
- Keep a list of the meals you have prepared.$content$,
      'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1000&q=80',
      date '2026-09-14'
    ),
    (
      'recovery',
      'Create a Recovery Checklist You Can Stick To',
      'create-a-recovery-checklist-you-can-stick-to',
      'Use a short daily checklist to reflect on your routine between training sessions.',
      $content$## 1. Make Space to Reflect
Write down how you feel after training and which parts of your routine were easy to maintain.
A short note is enough to make your next weekly review more useful.

## 2. Keep the Checklist Short
Choose a few habits you want to track rather than recording every detail of your day.
- Note your bedtime and wake time.
- Record how ready you feel for your next session.$content$,
      'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=1000&q=80',
      date '2026-09-13'
    )
)
insert into public.posts (
  category_id, status_id, title, slug, description, content, image, date, published_at
)
select
  categories.id,
  statuses.id,
  seed_posts.title,
  seed_posts.slug,
  seed_posts.description,
  seed_posts.content,
  seed_posts.image,
  seed_posts.post_date,
  seed_posts.post_date::timestamptz
from seed_posts
join public.categories on categories.slug = seed_posts.category_slug
join public.statuses on statuses.status = 'published'
on conflict (lower(slug)) where slug is not null do nothing;
