# Multi-school database setup

The original application remains unchanged on `main`. This branch introduces the database foundation for a multi-school StoryWeaver deployment.

## Architecture

- Supabase Auth for independent administrator, teacher, and optional student accounts.
- PostgreSQL with Row Level Security for tenant isolation.
- Private Supabase Storage bucket for story images, video, and audio.
- Students can have `login_enabled = false`; teachers or school administrators then manage their stories.
- A system administrator is identified by `app_metadata.role = system_admin`.

## Apply the migration

1. Create a Supabase project.
2. Install and authenticate the Supabase CLI.
3. Link this repository to the project.
4. Run `supabase db push`.
5. Copy `.env.example` to `.env.local` and set the project URL and anon key.
6. Run `npm install` and `npm run dev`.

Never commit the service-role key or Gemini API key. Gemini calls must be moved to an Edge Function before production deployment.

## Storage convention

Upload media to the private `story-media` bucket using:

`<school_id>/<story_id>/<scene_id>/<random-filename>`

## Account behavior

- School administrators invite teachers and create student records.
- A student record may exist without an Auth account.
- Enabling student login requires linking `profile_user_id` and setting `login_enabled = true`.
- Teachers only access students assigned through their classes.
- Students only access their own profile and stories.
- School administrators access their entire school.
- Data is isolated between schools by RLS.

## Bootstrap

The first system administrator should be assigned through trusted server-side administration by adding this to the user's Auth app metadata:

```json
{ "role": "system_admin" }
```

Then use a trusted server or Edge Function with the service-role key to create the first school and school-admin membership. Do not perform bootstrap operations from the browser.
