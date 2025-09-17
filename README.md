# QuizWave

Modern, themeable quiz platform for Teachers and Students.  
Built with vanilla HTML/CSS/JS + Supabase auth. Fully responsive, dark/light themed, and optimized for live sessions and results.

**Live demo:** https://quiz-wave.vercel.app/

---

## Features

- **Role-aware UI**: Admin, Teacher, Student navigation with auto-highlight & auth gating
- **Dark/Light theme** with smooth transitions (persists via `localStorage`)
- **Responsive**: cards, tables, forms, and navbar (hamburger under 960px)
- **Teacher tools**: quiz builder (Draft by default), quiz detail, “go live”, results
- **Student tools**: home feed, quick join by code, in-progress/available quizzes, recent scores
- **Admin overview**: users/quizzes/live sessions badge (via Supabase)
- **Polished components**: cards, chips, badges, tables, forms, sticky nav
- **Safe spacing**: consistent container paddings so nothing hugs the edges

> Most page JS depends on existing class/ID hooks. Reuse the provided classes; don’t rename hooks unless you update the JS too.

---

## Screenshots

<img width="1459" height="909" alt="image" src="https://github.com/user-attachments/assets/adca018e-f206-459a-8456-b5713951d35b" />
<img width="1423" height="848" alt="image" src="https://github.com/user-attachments/assets/49185707-009d-4255-8484-37141856fbcb" />
<img width="1476" height="886" alt="image" src="https://github.com/user-attachments/assets/3e01416c-8c1e-4f1b-a930-092ee98aa712" />

<img width="1333" height="529" alt="image" src="https://github.com/user-attachments/assets/6e9a9578-86e1-4a50-9458-229aea93eaa5" />



---

## Tech Stack

- **Front-end**: HTML5, vanilla JS, modular CSS
- **Design System**: CSS custom properties (tokens), utility classes, responsive grids
- **Auth / Data**: Supabase (user auth, profile/role, live sessions badge)
- **Hosting**: Vercel (static)

---

## Quick Start

### 1) Clone

```bash
git clone https://github.com/Rafsun-Islam/QuizWave.git
cd quizwave
```


### 2) Supabase client

The app expects a global client (Supabase) and these helpers from js/04-auth.js:

- getCurrentProfile()

- logoutUser()

- isAdmin()

Add Supabase and init before site-shell.js
