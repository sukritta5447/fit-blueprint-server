with seed_posts (
  category_slug,
  title,
  slug,
  description,
  content,
  image,
  post_date
) as (
  values
    (
      'training',
      '5 Principles of Progressive Overload That Actually Work',
      '5-principles-of-progressive-overload-that-actually-work',
      'Build strength with small, repeatable increases instead of turning every session into a test.',
      $content$## 1. Progress Is More Than Weight
Add a repetition, improve technique, increase range of motion, or reduce rest before reaching for a heavier load.
Tracking more than one useful variable reveals progress that the weight on the bar can hide.

## 2. Use the Smallest Effective Increase
The best progression is the one you can recover from and repeat. Small improvements compound without disrupting technique.

## 3. Review Each Training Week
Record the variables that match your goal, review them weekly, and change only one lever at a time.$content$,
      'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=1000&q=80',
      date '2026-07-28'
    ),
    (
      'nutrition',
      'Macros vs. Calories: What You Really Need to Track',
      'macros-vs-calories-what-you-really-need-to-track',
      'Use calories for direction and macros to support recovery, performance, and satiety.',
      $content$## 1. Start With Energy Balance
Calories determine the broad direction of body-weight change, but the source of those calories still shapes performance and hunger.

## 2. Set a Protein Floor
Choose a realistic calorie range and a daily protein minimum. Let carbohydrates and fats flex around preference and training demands.$content$,
      'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1000&q=80',
      date '2026-07-22'
    ),
    (
      'training',
      'How to Run Your First 10K in Under 60 Minutes',
      'how-to-run-your-first-10k-in-under-60-minutes',
      'An eight-week structure combining easy mileage, tempo work, and a controlled long run.',
      $content$## 1. Earn the Pace
Begin with conversational running and add short blocks near target pace after your weekly rhythm feels sustainable.

## 2. Keep Easy Days Easy
Most sessions should leave enough energy for the next one. Consistency develops endurance faster than repeated exhaustion.$content$,
      'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=1000&q=80',
      date '2026-07-15'
    ),
    (
      'recovery',
      'The Sleep Protocol Elite Athletes Swear By',
      'the-sleep-protocol-elite-athletes-swear-by',
      'Protect recovery with a simple evening routine built around light, timing, and consistency.',
      $content$## 1. Build a Reliable Runway
Keep a consistent wake time, dim the environment, and create space between the final meal and bedtime.

## 2. Remove Friction
Prepare the room before you feel tired. A repeatable environment makes recovery easier to protect.$content$,
      'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=1000&q=80',
      date '2026-07-10'
    ),
    (
      'mindset',
      'Mental Toughness: Train Your Mind Like a Muscle',
      'mental-toughness-train-your-mind-like-a-muscle',
      'Define what counts on difficult days and build consistency that survives low motivation.',
      $content$## 1. Build a Minimum Session
Decide in advance what a ten-minute version of training looks like. Starting small protects the habit and often restores momentum.

## 2. Judge the Process
Measure whether you followed the plan you could control, not whether every session felt exceptional.$content$,
      'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1000&q=80',
      date '2026-07-06'
    ),
    (
      'nutrition',
      'Creatine in 2026: Everything Science Now Knows',
      'creatine-in-2026-everything-science-now-knows',
      'A clear look at performance benefits, practical dosing, and common misconceptions.',
      $content$## 1. Keep the Protocol Simple
A consistent daily dose is sufficient for most people. Timing matters less than adherence and a useful training stimulus.

## 2. Support the Basics
Creatine complements sleep, nutrition, hydration, and progressive training. It does not replace them.$content$,
      'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?auto=format&fit=crop&w=1000&q=80',
      date '2026-07-02'
    )
)
insert into public.posts (
  category_id,
  status_id,
  title,
  slug,
  description,
  content,
  image,
  date,
  published_at
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
