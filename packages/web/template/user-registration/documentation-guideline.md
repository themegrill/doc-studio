# User Registration & Membership
# Documentation Writing Guidelines
ThemeGrill Internal Standard · wpuserregistration.com

## 1. URM Audience Profile

Every writing decision flows from understanding who you are writing for. URM has two distinct
reader types - hold both in mind simultaneously.

| Reader Type 1: Registration User | Reader Type 2: Membership Builder |
|---|---|
| Goal: Add user registration forms to WordPress Skill: Beginner to intermediate Pain: Default WordPress registration is ugly and limited Wants: Step-by-step guidance with screenshots | Goal: Build a paid membership site with restricted content Skill: Intermediate; understands payments/subscriptions Pain: Needs to understand how plans, payments, and access connect Wants: Conceptual clarity + step-by-step instructions |

Tone: Write as a knowledgeable colleague watching their screen. Never condescending,
never vague. Assume the reader is capable — but not that they know the product.

## 2. Article Types

Every URM doc falls into one of six types. Choose the right type before writing — it determines
structure, length, and opening formula.

| Type | Use when… | URM Examples |
|---|---|---|
| Tutorial / How-to | One specific task, one clear outcome | Setting Up Email Notifications, Creating a Membership Plan |
| Complete Guide | Multiple related tasks on one topic | A Complete Guide to Registration Fields |
| Addon / Integration | Connecting URM to a third-party service | Mailchimp Addon, Stripe Integration |
| Error / Troubleshooting | Fixing a specific known error | Resolving Login Redirect Loop |
| Reference | Lookup content with no sequential flow | Smart Tags Reference, Shortcode Reference |
| Account & License | Install, activate, renew, upgrade | Installing the Plugin, Verifying Your License Key |

## 3. Standard Article Anatomy

Every tutorial and complete guide follows this fixed eight-part structure. Don't skip or reorder
sections.

| # | Section | Rules |
|---|---|---|
| 1 | H1 Title (REQUIRED) | Gerund phrase: "Setting Up Email Notifications" — never a noun phrase like "Email Notification Settings" |
| 2 | Brief Intro (REQUIRED) | Three sentences: (a) desire question "Would you like to…?"; (b) value bridge "User Registration & Membership allows/lets…"; (c) scope promise "This tutorial will show you…" |
| 3 | Prerequisites (REQUIRED) | "Before getting started, make sure you've installed and activated the User Registration plugin." Always link to installation doc. Add a sentence for addon/paid-plan requirements. |
| 4 | Body Sections / H2 Steps (REQUIRED) | Sequential gerund H2 headings. Each step: 1–2 sentence intro, screenshot, action instruction. One screenshot per UI state change. |
| 5 | FAQ Section (OPTIONAL) | H2 "Frequently Asked Questions." Each Q as H3. Opens with standard intro sentence. |
| 6 | Closing Handoff (REQUIRED) | "That's it!" + recap + transition + next-step link. See Section 10. |

## 5. Opening Formulas

The opening block has three sentences. Each has a formula.

### Part 1: The Desire Question

✓ Goal-first (correct) "Would you like to add a custom registration form?" "Want to restrict
content to paid members only?"

✗ Product-first (wrong) "Would you like to use User Registration to create forms?" "Are
you interested in URM's Content Restriction feature?"

### Part 2: The Value Bridge

One sentence using: "User Registration & Membership allows you to…" or "…makes it easy
to…" or "With User Registration & Membership, you can…"

| Topic | Value Bridge Sentence |
|---|---|
| Registration forms | User Registration & Membership allows you to create fully custom registration forms with drag-and-drop fields and display them anywhere on your site. |
| Membership plans | User Registration & Membership makes it easy to create membership plans with different access levels, so you can control exactly what each member can see. |
| Content restriction | With User Registration & Membership, you can restrict any page, post, or custom content to specific plans or user roles — without any code. |
| Email notifications | User Registration & Membership automatically sends customizable email notifications whenever someone registers. |
| Payment setup | User Registration & Membership allows you to accept payments for membership subscriptions using Stripe, PayPal, or other gateways. |

### Part 3: The Scope Promise

| Article Type | Scope Promise Formula |
|---|---|
| Tutorial / How-to | "This tutorial will show you how to [outcome]." / "This tutorial will walk you through [action]." |
| Complete Guide | "This guide will answer some of the most common questions about [topic]." / "This guide will walk you through the steps to [outcome]." |
| Addon / Integration | "This tutorial will show you how to install and use the [Addon Name] with User Registration & Membership." |
| Error / Troubleshooting | "This tutorial will show you how to troubleshoot and fix [the specific error]." |

## 6. Sentence Architecture

Seven patterns account for ~85% of all instructional text. Master the structure, not just the
content.

| Pattern | Formula | URM Example | When to Use |
|---|---|---|---|
| 01: Navigate + Act + Purpose | From [location], go to [path] to [purpose]. | From the form builder, go to Settings > Notifications to access notification settings. | Starts every navigation step. Location first — orients before asking to act. |
| 02: To [Goal], [Action] | To [accomplish X], [action verb phrase]. | To create a new plan, go to User Registration & Membership > Membership > Add New. | Most common opener. States purpose before action. |
| 03: Once [Condition], [Result] | Once [step complete], [what happens next]. | Once you've selected a plan type, the settings for that type will appear below. | Bridges sequential steps. "Once" signals A unlocks B. |
| 04: Then, [Action] | Then, [imperative action]. | Then, in the overlay that appears, enter a name for your membership plan. | Lightweight connector between steps in the same section. Never start an H2 with "Then." |
| 05: By Default / However | By default, [state]. However, [option]. | By default, all users are assigned Subscriber role. However, you can change this. | Primary pattern for conditional behavior. Never use if/else trees. |
| 06: If You'd Prefer | If you'd [prefer / like / rather], [alternative]. | If you'd prefer to build from scratch, select the Blank Form option. | For optional paths. Always follows the primary path. Both paths equally valid. |
| 07: Here, You'll [See/Find] | Here, you'll [see / find] [what user observes]. | Here, you'll see a list of all your registration forms and their submission counts. | Always follows navigation. Confirms the user arrived in the right place. |

### Sentence Length Ratio

| Length | Target % | Purpose & Example |
|---|---|---|
| Short (5–12 words) | ~35% | Action commands. "Click the Save button to save your changes." |
| Medium (13–25 words) | ~50% | Navigation + context + result. "From the form builder, go to Settings > Notifications to access notification settings." |
| Long (26–40 words) | ~15% | Definitions. "Membership plans are subscription-based access tiers that determine which content a member can view based on their subscription tier." |

## 7. URM Vocabulary Guide

### Approved Action Verbs

| Verb | Use for |
|---|---|
| click | Buttons, links, menu items |
| go to | Navigation paths: "Go to User Registration & Membership >Settings" |
| navigate to | Longer navigation sequences; use sparingly |
| select | Dropdown options, radio buttons, checkboxes, templates |
| enter / type | Text fields ("enter" for structured fields, "type" for free-form) |
| toggle | On/off switches |
| enable / disable | Settings that can be turned on or off |
| add | Adding a new field, plan, rule, or connection |
| drag and drop | Moving fields in the form builder |
| hover over | Revealing contextual options |
| save | Always: "click the Save button to save your changes" |
| publish | Making a form or page live |
| copy / paste | Transferring content between fields or apps |
| install / activate | Plugin and addon setup steps |
| connect | Linking third-party accounts or payment gateways |

### URM-Specific Terminology

| Use This | Not This | Notes |
|---|---|---|
| User Registration & Membership | the plugin / UR / URM plugin | Always capitalize. First mention: "the User Registration & Membership plugin" |
| registration form | signup form / register form | Lowercase; not a proper noun |
| membership plan | plan type / package / tier | "plan" alone acceptable after first mention |
| member | subscriber / user | "member" for paid membership; "user" for general registration |
| content restriction | access control / gating | URM's specific feature name |
| form builder | editor / builder | Two words, lowercase |
| smart tag | variable / placeholder / token | Two words, lowercase |
| addon | plugin / extension | One word, lowercase |
| WordPress admin area | dashboard / backend / WP admin | Full phrase first mention; "WordPress admin" acceptable after |
| User Registration & Membership >Settings | Settings > User Registration | Always use >separator; bold the full path |

### Approved Adverbs & Human Connectors

The "Easily" Rule: Only three adverbs are approved: "easily" (simpler in URM than
alternatives), "quickly" (faster than expected), "instantly" (happens without delay). Never use:
effortlessly, seamlessly, powerfully, robustly.

| Connector | URM Example | When to Use |
|---|---|---|
| go ahead and | "…go ahead and create a new membership plan." | After setup step; signals user is ready to act |
| be sure to | "Be sure to save your form before leaving." | Before a reminder; adds mild urgency |
| feel free to | "Feel free to customize this message." | For optional customization; removes pressure |
| keep in mind | "Keep in mind that this applies to all forms." | Before a caveat |
| we recommend | "We recommend testing your form before going live." | Best-practice suggestions; uses team voice |
| for our example | "For our example, we'll use the Basic plan." | When choosing one path from many to demonstrate |

Use at most 1–2 per article. Overuse dilutes their effect.

## 8. Formatting Standards

### UI Elements — Always Bold

✓ Correct Click the **Save** button. Toggle **Enable Notifications** to on. Go to **User
Registration & Membership > Settings**. Select the **Stripe** option from the dropdown.

✗ Incorrect Click the "Save" button. Toggle 'Enable Notifications' to on. Go to User
Registration & Membership > Settings. Select the Stripe option.

### Navigation Paths

Use the > character (right double angle quotation mark). Bold the entire path.

✓ Correct **User Registration & Membership > Settings** **User Registration & Membership >
Membership > Plans** **Settings > Email**

✗ Incorrect User Registration & Membership > Settings User Registration & Membership /
Membership / Plans Go to settings then email

### Screenshots

- Every distinct UI action or state change needs a screenshot.
- Alt text describes the action performed, not image contents.
- Do not caption what the screenshot already shows.
- Filenames: kebab-case describing the action (e.g., add-new-membership-plan.png).

✓ Good Alt Text "Click Save Registration Form button" "Access membership plan
settings" "Enable content restriction for post"

✗ Bad Alt Text "Screenshot of the form" "User Registration & Membership settings
page" "Image showing toggle button"

### Status Labels

Rule: UI labels that appear on-screen in all caps are written in ALL CAPS in documentation
text. Example: "Each plan includes a status badge labeled ACTIVE. Click it to change the
status to INACTIVE."

## 9. Callout Types & Usage Rules

| Type | Purpose | Format | URM Example |
|---|---|---|---|
| Note | Cross-links, behavior clarifications, optional alternatives, context the reader should know but not act on immediately. | "Note: [1–2 sentences max]" | "Note: If you'd like to explore additional plan types, see our complete guide to membership plan configuration." |
| Requirements | States license level or addon required. Always appears BEFORE the instructions. | "Requirements: [Feature] requires the [Addon] addon, available with [Plan] or higher." | "Requirements: Stripe integration requires the Pro addon. You'll need a Pro license or higher." |
| Tip | Best practices, timesaving shortcuts, suggestions that improve outcomes but are not required. | "Tip: [1 sentence]" | "Tip: We recommend testing your form by submitting a test entry before going live." |
| Warning | Actions that could cause data loss, break functionality, or create security issues. Use rarely. | "Warning: [1 sentence describing consequence]" | "Warning: Deleting a membership plan will immediately revoke access for all members on that plan." |

Prerequisite Block (Required on Every Tutorial): Before getting started, make sure you've
installed and activated the User Registration & Membership plugin on your WordPress site.
[If addon required: Then, make sure you've installed and activated the [Addon Name]
addon.]

Note Placement Rule: Notes always appear BEFORE the step they qualify — never after. A
note is a prerequisite warning, not a footnote.

## 10. Closing & Handoff Pattern

No article ends on its last step. Every article closes with a handoff that celebrates the
accomplishment and points to the next logical action.

| Part | Formula & Rules |
|---|---|
| Celebration | Always: "That's it!" — never "You're done!" or "Finished!" or "Congratulations!" |
| Accomplishment | "Now you know how to [verb phrase]." / "Now you've [completed action]." |
| Transition | "Next, [transition question or statement]?" — mirrors the reader's likely next thought |
| Next-step link | "Be sure to check out our [tutorial / guide] on [linked topic] for more details." |

### Closing Examples

| Article Type | Closing Example |
|---|---|
| Tutorial | That's it! Now you know how to set up email notifications for your registration forms. Next, would you like to customize the email template to match your brand? Be sure to check out our guide on customizing registration email templates for all the details. |
| Complete Guide | That's it! Now you know all the different ways to manage membership plans. Next, are you wondering how to restrict content to specific plans? Be sure to check out our complete guide to content restriction. |
| Addon / Integration | That's it! You've successfully connected User Registration & Membership with Mailchimp. Next, would you like to control which users get added to your mailing list? Be sure to check out our tutorial on using conditional logic with the Mailchimp addon. |
| Error / Troubleshooting | That's it! Now you know how to troubleshoot and fix the login redirect loop error. Next, want to learn more about preventing common registration errors? Be sure to check out our troubleshooting guide. |

Troubleshooting Tail (Complex Articles Only): After "That's it!" on complex
troubleshooting guides, add: "Still experiencing issues? Check out our general User
Registration & Membership troubleshooting guide for additional help."

## 11. Six Techniques That Make Docs Sound Human

### 1. Context Before Action — Never Orphan an Instruction

✓ "Once you've set up your membership plan, click the Save Changes button to save
your settings."

✗ "Click Save Changes."

Every action is preceded by its context (state, location, or condition). Prevents "wait, which
button?" confusion.

### 2. Name What the User Will See After Acting

✓ "Click the Add New Plan button. This will open an overlay where you can enter your
plan's name and description."

✗ "Click the Add New Plan button to create a new plan."

Confirms the user arrived in the right place. Always describe the observable result.

### 3. Embed the "Why" Inside the Instruction

✓ "We recommend adding a welcome email — it's a great way to immediately engage
users and reduce drop-off."

✗ "Add a welcome email. (See Note below for why this is recommended.)"

The reason belongs inside or immediately after the instruction — not deferred to a callout unless
it's long.

### 4. "We" Voice for Recommendations and Examples

✓ "We recommend testing your form before making it live." / "For our example, we'll use
the Stripe gateway."

✗ "It is recommended to test your form." / "The tutorial uses Stripe as an example."

"We" creates a sense of a knowledgeable team guiding the reader. Use it exactly twice per
article: once for a best-practice recommendation, once for a "for our example" framing.

### 5. "For This Tutorial" Scoping Hedge

✓ "For this tutorial, we'll focus on the Basic plan. For details on other plan types, see our
complete guide to membership plans."

✗ "There are several plan types available." [continues without explaining which one is
covered]

When a tutorial covers only one path of many, tell the reader explicitly. Prevents "wait, what
about X?" questions.

### 6. Validate Both Paths — No "Wrong" Alternative

✓ "Once your plan is set up, click Save Plan. If you'd prefer to set it up later, you can
always return from User Registration & Membership > Membership."

✗ "Make sure to save your plan. However, if you choose not to, note that the plan will not
be active until saved."

Both the primary path and the alternative are equally valid. "However" before an alternative
implies the primary path is better. Use "If you'd prefer…" instead.

## 12. Anti-Patterns — What to Never Do

| Anti-Pattern | ✗ Wrong | ✓ Correct |
|---|---|---|
| Never start a sentence with the product name for an instruction. | "User Registration & Membership enables notifications by default." | "By default, notifications are enabled for your registration forms." |
| Never write a definition before telling the user what to do. | "Membership plans are subscription tiers that control content access. You can create them in URM > Membership." | "To create a new membership plan, go to User Registration & Membership > Membership > Add New. Membership plans control which content each member can access." |
| Never use passive voice for instructions. | "The Save button can be clicked to save your settings." | "Click the Save button to save your settings." |
| Never chain more than 3 actions in one sentence. | "Go to URM > Settings, click the Payments tab, select Stripe, enter your API key, and click Save Settings." | Break into 3 sentences: "Go to User Registration & Membership > Settings. Then, click the Payments tab. Select Stripe and enter your API key, then click Save Settings." |
| Never use marketing adjectives in instructional content. | "User Registration & Membership's powerful, robust, and seamless membership system lets you…" | "User Registration & Membership makes it easy to create and manage membership plans from your WordPress admin area." |
| Never describe what a screenshot already shows. | "Click the blue Add New button in the upper right corner, as highlighted below." | "Click the Add New button. [screenshot]" |
| Never close without a "That's it!" handoff. | Last paragraph ends: "Click Save Settings to save your payment configuration." [end] | End with: "That's it! Now you know how to set up Stripe payments. Next, would you like to test your setup? Be sure to check out our guide on testing payment integrations." |
| Never use "click here" as link text. | "For more information, click here." / "See this guide for details." | "Be sure to check out our guide on setting up membership email notifications." |

## 13. Addon & Integration Article Structure

Integration articles follow a consistent 7-section structure. Every section is required.

| # | Section | Key Rules |
|---|---|---|
| 1 | Requirements Block | List license level and addon required. Format: "Requirements: [feature] requires the [Addon] addon, available with [Plan] or higher." |
| 2 | Installation | Brief install/activate instruction, linking to the general addon installation guide. |
| 3 | Connecting Your Account | Go to URM > Settings > Integrations. Step-by-step to authenticate. Confirm with "you'll see a green Connected status." |
| 4 | Linking to a Registration Form | Create or edit a form. Navigate to the Marketing/Integration tab. Click Add New Connection. |
| 5 | Field Mapping | Map URM form fields to third-party service fields. Explain each row. Note optional vs. required mappings. |
| 6 | Conditional Logic (if supported) | Show how to use Enable Conditional Logic. Link to the main conditional logic guide. |
| 7 | Testing + Closing | Recommend saving and submitting a test entry. Then the standard "That's it!" closing. |

## 14. Error & Troubleshooting Article Structure

### Opening Formula

Formula: "The '[Error Name]' error occurs when [context/trigger]. This error indicates [root
cause explanation]."

URM Example: "The 'Registration email not sending' error occurs when a new user submits
a form but no email is received. This error typically indicates a misconfiguration in your site's
email delivery settings or SMTP setup."

### Diagnostic Steps Pattern

Troubleshooting steps use a numbered checklist — the one place in URM docs where a
numbered list replaces sequential prose.

- Check that email notifications are enabled (Settings > Notifications, confirm Enable
Notifications toggle is on).
- Verify SMTP configuration (URM > Settings > Email).
- Test email delivery using the Send Test Email button.
- Check the spam folder.
- Disable conflicting plugins temporarily if issue persists.

Rule: Lead with the most common/easiest fix. Order steps from most-likely-to-fix to least-
likely. Link out to related guides rather than embedding them inline.

## 15. Full Article Templates

### Template A: Tutorial / How-to Article

```
# [Gerund Phrase: Action + Outcome]

#### AI Summary
[Desire question]? [Value bridge sentence.] This tutorial will [show you how to / walk you
through] [specific outcome].

[Embed YouTube tutorial video here]

Before getting started, make sure you've installed and activated the User Registration &
Membership plugin on your WordPress site. [If addon required: Then, make sure you've
installed and activated the [Addon Name] addon.]

## [Gerund Phrase: First Step]
[1–2 sentences of context.] To [purpose], go to User Registration & Membership > [Path]. Here, you'll [see/find] [what the user observes]. [Screenshot] [If conditional:] If you'd prefer to [alternative], [alternative action].

## [Gerund Phrase: Second Step]
[Repeat: context → navigation → "Here, you'll…" → screenshot → instruction] Note: [Cross-link or clarification if needed. Always BEFORE the step it qualifies.]

## [Gerund Phrase: Final Step]
[Final step.] That's it! Now you know how to [accomplished outcome]. Next, [transition
question]? Be sure to check out our [tutorial/guide] on [linked topic] for [all the details / more
information].
```

### Template B: Addon / Integration Article

```
# Using the [Service Name] Addon with User Registration & Membership

Requirements: The [Addon Name] addon is required. Available with [Plan] or higher.

[Desire question + value bridge + scope promise] Before getting started, make sure you've
installed and activated the plugin and the [Addon Name] addon.

## Installing the [Addon Name] Addon
Go to User Registration & Membership > Addons and search for "[Addon Name]." Click
Install Addon, then Activate. Note: For complete addon installation instructions, see our
addon installation guide.

## Connecting Your [Service Name] Account
Go to User Registration & Membership > Settings > Integrations. Click [Service Name], then
click Connect with [Service Name]. Once connected, you'll see a green CONNECTED
status.

## Connecting [Service Name] to a Registration Form
Create or edit a form to open the form builder. Go to Marketing > [Service Name] and click
Add New Connection. Enter a nickname (internal only), then click OK.

## Mapping Your Form Fields
[Explain mapping interface. Describe each required mapping. Note which are optional.]
Note: [Important behavior note about mapping.]

## Using Conditional Logic (Optional)
```

Toggle on Enable Conditional Logic to control when the integration runs. See our
conditional logic guide for full details. [Standard "That's it!" closing with next-step link]

### Template C: FAQ Section

Rule: FAQ sections always open with: "These are answers to some of the most common
questions we receive about [topic]." Each question is an H3. Answers are 1–3 sentences
with links to related guides for full detail.

## 16. Heading & Title Naming Rules

### H1 Article Titles

Always use gerund phrases (verb + -ing). URL slugs may use "How to…" for SEO, but the on-
page H1 is always the shorter gerund form.

✓ H1 (on-page) Setting Up Email Notifications Creating a Membership Plan
Enabling Content Restriction Installing the User Registration & Membership Plugin
Connecting Stripe to Your Site

✗ Avoid Email Notification Settings Guide How To Create a Membership Plan in URM
Content Restriction Feature User Registration & Membership Installation Stripe
Setup

### H2 Section Headings

H2 headings are also gerund phrases — they label the action performed in that section. Never
noun phrases or question-form headings.

✓ Correct H2s Accessing Registration Form Settings Enabling Membership Plan
Payments Configuring Email Notification Templates Adding Content Restriction Rules

✗ Incorrect H2s Registration Form Settings How to Enable Payments Email Notification
Template Configuration Step 3: Content Restriction

### H3 & Title Case Rules

H3s can use gerund or noun phrases. Use H3 only when a major H2 section has two or more
distinct sub-tasks. Title case for all headings (H1–H3). Product names follow official
capitalization.

✓ Correct User Registration & Membership WordPress / Stripe / PayPal WooCommerce /
Mailchimp / WPForms Smart Tags

✗ Incorrect user registration & membership Wordpress / stripe / Paypal Woocommerce /
MailChimp / WpForms smart tags

## 17. Linking Rules

### Link Text — Always Descriptive

✓ Correct "…see our guide on setting up membership email notifications." "…check
out our complete guide to content restriction." "…read our tutorial on installing User
Registration & Membership addons."

✗ Incorrect "…click here for more information." "…see this guide." "…learn
more here."

### Cross-Link Formulas

Pattern 1: "For [complete details / more information] on [topic], see our [guide / tutorial] on
[linked article title]."

Pattern 2: "If you'd like [to do X], be sure to check out our [complete guide / tutorial] on
[linked article title]."

Link every mentioned feature to its documentation article on first mention. Don't repeat the
same link more than once per section. Link generously — deep cross-linking helps readers find
what they need without leaving the docs.

## 18. Paragraph Structure & Rhythm

Each instructional paragraph follows a tight three-part sequence.

| Part | URM Example |
|---|---|
| 1. Location / Context sentence | "From the form builder, go to Settings > Notifications…" |
| 2. Action sentence | "…to access your form's email notification settings." |
| 3. Result / Screenshot anchor | "Here, you'll see the Enable Notifications toggle. [screenshot]" |

The 80-Word Rule: No H2 section should exceed ~80 words of prose before a screenshot
appears. Reading rhythm: read → see → act → repeat. If a section is getting longer, break
into sub-steps or split into two H2 sections.

### Lists vs. Prose

Use numbered lists for:
- Sequential troubleshooting steps
- Error diagnostic checklists
- Multi-step processes where order matters

Use prose (not lists) for:
- All instructional tutorial steps
- Opening paragraphs
- FAQ answers
- Notes and callouts

### Quick Reference Card

Paste this card into your writing environment as a daily reminder.

| Before You Write — Ask: | Before You Publish — Check: |
|---|---|
| → What type of article is this? → Who is reading — Registration User or Membership Builder? → What does the reader want to accomplish? → What is the single most common mistake at each step? → What do they do AFTER completing this? | ✓ H1 is a gerund phrase ✓ 3-part intro: desire → value → scope ✓ Prerequisites before first H2 ✓ Every UI element is bold ✓ All nav paths use > separator ✓ Every step has a screenshot ✓ Notes are BEFORE the steps they qualify ✓ "That's it!" closing with next-step link ✓ No "click here" link text ✓ No passive voice instructions |

User Registration & Membership Documentation Writing Guidelines
