"""Prepared samples for demo mode (MOCK_MODE=true).

Each sample describes a feature as structured data (acceptance criteria, test
cases, page-object locators and per-test actions). A small renderer turns the
actions into real Playwright TypeScript, so demo output is consistent with what
the live crew is asked to produce and passes `playwright test --list`.
"""
from __future__ import annotations

import re
from typing import Any

# ------------------------------------------------------------ action helpers
G = ["goto"]


def F(loc: str, val: str) -> list:  # fill
    return ["fill", loc, val]


def C(loc: str) -> list:  # click
    return ["click", loc]


def P(loc: str, key: str) -> list:  # press
    return ["press", loc, key]


def V(loc: str) -> list:  # expect visible
    return ["expectVisible", loc]


def X(loc: str, text: str) -> list:  # expect text
    return ["expectText", loc, text]


def U(pattern: str) -> list:  # expect url
    return ["expectUrl", pattern]


def R(n: int, *acts: list) -> list:  # repeat
    return ["repeat", n, list(acts)]


def T(tid, ac, typ, prio, title, steps, expected, actions, weak=None) -> dict[str, Any]:
    return {
        "id": tid,
        "criterion_id": ac,
        "type": typ,
        "priority": prio,
        "title": title,
        "steps": steps,
        "expected": expected,
        "actions": actions,
        "weak_actions": weak,
    }


def AC(id_, text, amb=None) -> dict[str, Any]:
    return {"id": id_, "text": text, "ambiguity_note": amb}


# ----------------------------------------------------------------- samples
_VE, _VP, _BP = "qa.user@example.com", "CorrectHorse!42", "WrongPass#1"
_bad_login = [F("email", _VE), F("password", _BP), C("submit")]

LOGIN = {
    "id": "login",
    "title": "Login with account lockout",
    "blurb": "Email + password sign-in, 3-strike lockout, password reset, session expiry",
    "keywords": ["login", "log in", "sign in", "lockout", "locked", "dashboard"],
    "base_url": "http://localhost:3000",
    "story": (
        "As a registered user, I want to log in with my email and password so that I can access my dashboard.\n\n"
        "Acceptance notes:\n"
        "- Valid credentials take the user to the dashboard.\n"
        "- Invalid credentials show an error and the user stays on the login page.\n"
        "- Email and password are both required.\n"
        "- After 3 consecutive failed attempts the account is locked for 15 minutes.\n"
        "- A \"Forgot password\" link opens the password reset page.\n"
        "- Sessions expire after 30 minutes of inactivity."
    ),
    "feature": "Login",
    "page_class": "LoginPage",
    "page_file": "LoginPage",
    "page_path": "/login",
    "locators": {
        "email": ("label", "Email"),
        "password": ("label", "Password"),
        "submit": ("role", "button", "Sign in"),
        "error": ("testid", "login-error"),
        "emailError": ("testid", "email-error"),
        "passwordError": ("testid", "password-error"),
        "forgot": ("role", "link", "Forgot password"),
        "dashboardHeading": ("role", "heading", "Dashboard"),
    },
    "criteria": [
        AC("AC-1", "A registered user can sign in with a valid email and password and lands on the dashboard."),
        AC("AC-2", "Invalid credentials show an error message and keep the user on the login page."),
        AC("AC-3", "Email and password are both required; empty or malformed input is rejected with field-level messages.",
           "Validation rules for the email format are not specified."),
        AC("AC-4", "After 3 consecutive failed attempts the account is locked for 15 minutes and the user sees a lockout message.",
           "Is the failure counter reset by a successful login? The lockout message wording is not specified."),
        AC("AC-5", "The \"Forgot password\" link opens the password reset page."),
        AC("AC-6", "Sessions expire after 30 minutes of inactivity.",
           "Does any user action reset the inactivity timer, or only page navigation?"),
    ],
    "tests": [
        T("TC-001", "AC-1", "positive", "P0", "Valid credentials land on the dashboard",
          ["Open the login page", "Enter a valid email and password", "Click Sign in"],
          "The user is redirected to /dashboard and the Dashboard heading is visible.",
          [G, F("email", _VE), F("password", _VP), C("submit"), U("/dashboard"), V("dashboardHeading")]),
        T("TC-002", "AC-1", "positive", "P1", "Pressing Enter submits the login form",
          ["Open the login page", "Enter valid credentials", "Press Enter in the password field"],
          "The form submits and the user lands on the dashboard.",
          [G, F("email", _VE), F("password", _VP), P("password", "Enter"), U("/dashboard")]),
        T("TC-003", "AC-2", "negative", "P0", "Wrong password shows a generic error",
          ["Open the login page", "Enter a valid email with a wrong password", "Click Sign in"],
          "An 'Invalid email or password' error is shown and the URL stays on /login.",
          [G, *_bad_login, X("error", "Invalid email or password"), U("/login")]),
        T("TC-004", "AC-2", "negative", "P1", "Unknown email shows the same generic error",
          ["Open the login page", "Enter an email that is not registered", "Click Sign in"],
          "The same generic error is shown, so account existence is not revealed.",
          [G, F("email", "nobody@example.com"), F("password", _BP), C("submit"),
           X("error", "Invalid email or password")]),
        T("TC-005", "AC-3", "negative", "P0", "Empty form shows required-field messages",
          ["Open the login page", "Leave both fields empty", "Click Sign in"],
          "'Email is required' and 'Password is required' are displayed.",
          [G, C("submit"), X("emailError", "Email is required"), X("passwordError", "Password is required")]),
        T("TC-006", "AC-3", "edge", "P1", "Malformed email is rejected before submit",
          ["Open the login page", "Enter 'not-an-email' as the email", "Enter a password and click Sign in"],
          "An 'Enter a valid email address' message is shown.",
          [G, F("email", "not-an-email"), F("password", _VP), C("submit"),
           X("emailError", "Enter a valid email address")]),
        T("TC-007", "AC-4", "negative", "P0", "Account locks after 3 failed attempts",
          ["Open the login page", "Submit a wrong password 3 times in a row"],
          "A lockout message states the account is locked for 15 minutes.",
          [G, R(3, *_bad_login), X("error", "Account locked for 15 minutes")]),
        T("TC-008", "AC-4", "edge", "P0", "Correct password is rejected while the account is locked",
          ["Trigger a lockout with 3 wrong passwords", "Enter the correct password", "Click Sign in"],
          "The user is still locked out and stays on /login.",
          [G, R(3, *_bad_login), F("email", _VE), F("password", _VP), C("submit"),
           X("error", "Account locked for 15 minutes"), U("/login")]),
        T("TC-009", "AC-4", "edge", "P1", "Two failed attempts do not lock the account",
          ["Submit a wrong password twice", "Submit the correct password"],
          "The third attempt succeeds and the user reaches the dashboard.",
          [G, R(2, *_bad_login), F("email", _VE), F("password", _VP), C("submit"), U("/dashboard")]),
        T("TC-010", "AC-5", "positive", "P2", "Forgot password link opens the reset page",
          ["Open the login page", "Click 'Forgot password'"],
          "The user is taken to /forgot-password.",
          [G, C("forgot"), U("/forgot-password")],
          weak=[G, C("forgot")]),
        T("TC-011", "AC-2", "negative", "P1", "Incorrect password displays an error message",
          ["Open the login page", "Enter a valid email with a wrong password", "Click Sign in"],
          "An 'Invalid email or password' error is shown and the URL stays on /login.",
          [G, *_bad_login, X("error", "Invalid email or password"), U("/login")]),
    ],
    "gap_notes": {
        "AC-6": (
            "No UI-level test covers session expiry: it needs a controllable clock.",
            "Use page.clock.install() and page.clock.fastForward('31:00') to simulate 31 idle minutes, "
            "then assert the user is redirected to /login.",
        ),
    },
}

_CO_ADDR = [F("address", "12 Main Street"), F("city", "Springfield"), F("postal", "62704")]
CHECKOUT = {
    "id": "checkout",
    "title": "Checkout with promo code and free shipping",
    "blurb": "Cart review, promo codes, shipping rules, address validation, payment",
    "keywords": ["checkout", "cart", "promo", "shipping", "place an order", "payment"],
    "base_url": "http://localhost:3000",
    "story": (
        "As a shopper, I want to review my cart, apply a promo code, enter shipping and card details, and place "
        "an order so that I receive my items.\n\n"
        "Acceptance notes:\n"
        "- The cart shows items, quantities and a running subtotal.\n"
        "- A valid promo code reduces the total; an invalid code shows an error.\n"
        "- Orders over $50 ship free; smaller orders pay a flat shipping fee.\n"
        "- Shipping address fields are required before payment.\n"
        "- A successful payment shows an order confirmation with an order number.\n"
        "- A declined card shows an error and keeps the cart intact."
    ),
    "feature": "Checkout",
    "page_class": "CheckoutPage",
    "page_file": "CheckoutPage",
    "page_path": "/checkout",
    "locators": {
        "subtotal": ("testid", "cart-subtotal"),
        "promoInput": ("label", "Promo code"),
        "applyPromo": ("role", "button", "Apply"),
        "promoMessage": ("testid", "promo-message"),
        "shipping": ("testid", "shipping-cost"),
        "total": ("testid", "order-total"),
        "address": ("label", "Address"),
        "city": ("label", "City"),
        "postal": ("label", "Postal code"),
        "cardNumber": ("label", "Card number"),
        "placeOrder": ("role", "button", "Place order"),
        "addressError": ("testid", "address-error"),
        "confirmation": ("role", "heading", "Thank you for your order"),
        "orderNumber": ("testid", "order-number"),
    },
    "criteria": [
        AC("AC-1", "The cart shows items, quantities and a running subtotal."),
        AC("AC-2", "A valid promo code reduces the order total; an invalid code shows an error.",
           "Can more than one promo code be combined?"),
        AC("AC-3", "Orders over $50 ship free; smaller orders are charged a flat shipping fee.",
           "Is the $50 threshold evaluated before or after the promo discount?"),
        AC("AC-4", "Shipping address fields are required before payment can be submitted."),
        AC("AC-5", "A successful payment shows an order confirmation with an order number."),
        AC("AC-6", "A declined card shows an error and keeps the cart intact."),
    ],
    "tests": [
        T("TC-001", "AC-1", "positive", "P0", "Cart shows the running subtotal",
          ["Open checkout with a seeded cart of two $32 items"],
          "The subtotal reads $64.00.",
          [G, V("subtotal"), X("subtotal", "$64.00")]),
        T("TC-002", "AC-2", "positive", "P0", "Valid promo code reduces the total",
          ["Open checkout", "Enter SAVE10", "Click Apply"],
          "A '10% off applied' message appears and the total drops to $57.60.",
          [G, F("promoInput", "SAVE10"), C("applyPromo"), X("promoMessage", "10% off applied"),
           X("total", "$57.60")]),
        T("TC-003", "AC-2", "negative", "P1", "Invalid promo code shows an error",
          ["Open checkout", "Enter NOTACODE", "Click Apply"],
          "A 'Promo code is not valid' message is shown and the total is unchanged.",
          [G, F("promoInput", "NOTACODE"), C("applyPromo"), X("promoMessage", "Promo code is not valid")],
          weak=[G, F("promoInput", "NOTACODE"), C("applyPromo")]),
        T("TC-004", "AC-3", "positive", "P0", "Orders over $50 ship free",
          ["Open checkout with a $64 cart"],
          "Shipping is shown as Free.",
          [G, X("shipping", "Free")]),
        T("TC-005", "AC-3", "edge", "P1", "Discount that drops the total under $50 charges shipping",
          ["Open checkout with a $64 cart", "Apply SAVE25 (25% off, total becomes $48)"],
          "A $4.99 shipping fee is applied (assumes the threshold is checked after the discount).",
          [G, F("promoInput", "SAVE25"), C("applyPromo"), X("shipping", "$4.99")]),
        T("TC-006", "AC-4", "negative", "P0", "Missing address blocks payment",
          ["Open checkout", "Leave the address empty", "Click Place order"],
          "'Address is required' is shown and no order is placed.",
          [G, C("placeOrder"), X("addressError", "Address is required")]),
        T("TC-007", "AC-4", "negative", "P1", "Missing postal code blocks payment",
          ["Enter address and city only", "Click Place order"],
          "'Postal code is required' is shown.",
          [G, F("address", "12 Main Street"), F("city", "Springfield"), C("placeOrder"),
           X("addressError", "Postal code is required")]),
        T("TC-008", "AC-5", "positive", "P0", "Successful payment shows the order confirmation",
          ["Enter a valid address", "Enter test card 4242 4242 4242 4242", "Click Place order"],
          "The confirmation heading and an order number are visible.",
          [G, *_CO_ADDR, F("cardNumber", "4242 4242 4242 4242"), C("placeOrder"),
           V("confirmation"), V("orderNumber")]),
        T("TC-009", "AC-5", "positive", "P2", "Order is confirmed after paying with a valid card",
          ["Enter a valid address", "Enter test card 4242 4242 4242 4242", "Click Place order"],
          "The confirmation heading and an order number are visible.",
          [G, *_CO_ADDR, F("cardNumber", "4242 4242 4242 4242"), C("placeOrder"),
           V("confirmation"), V("orderNumber")]),
    ],
    "gap_notes": {
        "AC-6": (
            "Declined-card handling is untested; it needs a payment sandbox card that always declines.",
            "Use the provider's decline test card (for example 4000 0000 0000 0002), submit, and assert the "
            "error message and that the cart subtotal is unchanged.",
        ),
    },
}

_SU_BASE = [F("name", "Ada Lovelace"), F("email", "@unique_email")]
SIGNUP = {
    "id": "signup",
    "title": "New account sign-up",
    "blurb": "Registration form, password rules, duplicate email, confirmation page",
    "keywords": ["sign up", "signup", "register", "registration", "create an account", "verification email"],
    "base_url": "http://localhost:3000",
    "story": (
        "As a new visitor, I want to create an account with my name, email and password so that I can start "
        "using the product.\n\n"
        "Acceptance notes:\n"
        "- A valid sign-up lands on a 'Check your inbox' page.\n"
        "- Passwords need at least 8 characters and one number.\n"
        "- An email that is already registered is rejected.\n"
        "- Name and email are required.\n"
        "- The password must be confirmed.\n"
        "- A verification email is sent after sign-up."
    ),
    "feature": "Sign up",
    "page_class": "SignupPage",
    "page_file": "SignupPage",
    "page_path": "/signup",
    "locators": {
        "name": ("label", "Full name"),
        "email": ("label", "Email"),
        "password": ("label", "Password"),
        "confirm": ("label", "Confirm password"),
        "submit": ("role", "button", "Create account"),
        "nameError": ("testid", "name-error"),
        "emailError": ("testid", "email-error"),
        "passwordError": ("testid", "password-error"),
        "confirmError": ("testid", "confirm-error"),
        "inboxHeading": ("role", "heading", "Check your inbox"),
    },
    "criteria": [
        AC("AC-1", "A valid sign-up creates the account and shows the 'Check your inbox' page."),
        AC("AC-2", "Passwords must contain at least 8 characters and at least one number.",
           "Are other character classes (uppercase, symbols) required?"),
        AC("AC-3", "An email address that is already registered is rejected with a clear message."),
        AC("AC-4", "Full name and email are required fields."),
        AC("AC-5", "The password must be re-entered and both entries must match.",
           "The story does not mention a confirm-password field; the tests assume one exists."),
        AC("AC-6", "A verification email is sent after sign-up."),
    ],
    "tests": [
        T("TC-001", "AC-1", "positive", "P0", "Valid sign-up shows the Check your inbox page",
          ["Open the sign-up page", "Fill every field with valid values", "Click Create account"],
          "The 'Check your inbox' heading is visible.",
          [G, *_SU_BASE, F("password", "Secret123"), F("confirm", "Secret123"), C("submit"), V("inboxHeading")]),
        T("TC-002", "AC-2", "negative", "P0", "Password shorter than 8 characters is rejected",
          ["Enter a 5-character password with a number", "Click Create account"],
          "A 'at least 8 characters' message is shown.",
          [G, *_SU_BASE, F("password", "abc12"), F("confirm", "abc12"), C("submit"),
           X("passwordError", "at least 8 characters")]),
        T("TC-003", "AC-2", "negative", "P0", "Password without a number is rejected",
          ["Enter an 8+ character password with no digits", "Click Create account"],
          "A 'must include a number' message is shown.",
          [G, *_SU_BASE, F("password", "abcdefghij"), F("confirm", "abcdefghij"), C("submit"),
           X("passwordError", "must include a number")]),
        T("TC-004", "AC-2", "edge", "P1", "Password of exactly 8 characters with a number is accepted",
          ["Enter 'abcdefg1' as the password and confirmation", "Click Create account"],
          "The sign-up succeeds (boundary value).",
          [G, *_SU_BASE, F("password", "abcdefg1"), F("confirm", "abcdefg1"), C("submit"), V("inboxHeading")]),
        T("TC-005", "AC-3", "negative", "P0", "Already-registered email is rejected",
          ["Enter the email of an existing account", "Click Create account"],
          "An 'already registered' message is shown next to the email field.",
          [G, F("name", "Ada Lovelace"), F("email", "qa.user@example.com"), F("password", "Secret123"),
           F("confirm", "Secret123"), C("submit"), X("emailError", "already registered")]),
        T("TC-006", "AC-4", "negative", "P1", "Empty name is rejected",
          ["Leave Full name empty", "Fill the other fields", "Click Create account"],
          "'Full name is required' is shown.",
          [G, F("email", "@unique_email"), F("password", "Secret123"), F("confirm", "Secret123"), C("submit"),
           X("nameError", "Full name is required")],
          weak=[G, F("email", "@unique_email"), F("password", "Secret123"), F("confirm", "Secret123"),
                C("submit")]),
        T("TC-007", "AC-4", "negative", "P1", "Empty email is rejected",
          ["Leave Email empty", "Fill the other fields", "Click Create account"],
          "'Email is required' is shown.",
          [G, F("name", "Ada Lovelace"), F("password", "Secret123"), F("confirm", "Secret123"), C("submit"),
           X("emailError", "Email is required")]),
        T("TC-008", "AC-5", "negative", "P1", "Mismatched confirmation is rejected",
          ["Enter different values in Password and Confirm password", "Click Create account"],
          "'Passwords do not match' is shown.",
          [G, *_SU_BASE, F("password", "Secret123"), F("confirm", "Secret124"), C("submit"),
           X("confirmError", "Passwords do not match")]),
        T("TC-009", "AC-1", "positive", "P2", "Sign-up with valid details completes",
          ["Open the sign-up page", "Fill every field with valid values", "Click Create account"],
          "The 'Check your inbox' heading is visible.",
          [G, *_SU_BASE, F("password", "Secret123"), F("confirm", "Secret123"), C("submit"), V("inboxHeading")]),
    ],
    "gap_notes": {
        "AC-6": (
            "Email delivery is not observable from the browser, so no test covers it.",
            "Route sign-up mail to a sandbox inbox such as Mailpit and poll its HTTP API for the verification "
            "message inside the test.",
        ),
    },
}

SAMPLES: dict[str, dict[str, Any]] = {s["id"]: s for s in (LOGIN, CHECKOUT, SIGNUP)}


def public_samples() -> list[dict[str, Any]]:
    return [
        {"id": s["id"], "title": s["title"], "blurb": s["blurb"], "story": s["story"], "base_url": s["base_url"]}
        for s in SAMPLES.values()
    ]


def pick_sample(story: str) -> dict[str, Any]:
    """Pick the closest prepared sample by keyword overlap (default: login)."""
    text = story.lower()
    best, best_score = LOGIN, 0
    for s in SAMPLES.values():
        score = sum(text.count(k) for k in s["keywords"])
        if score > best_score:
            best, best_score = s, score
    return best


# ------------------------------------------------------------------ renderer
def _q(s: str) -> str:
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def _re_escape(s: str) -> str:
    return re.sub(r"([\\^$.*+?()[\]{}|/])", r"\\\1", s)


def _locator_expr(spec: tuple) -> str:
    kind = spec[0]
    if kind == "label":
        return f"page.getByLabel({_q(spec[1])}, {{ exact: true }})"
    if kind == "role":
        return f"page.getByRole({_q(spec[1])}, {{ name: {_q(spec[2])} }})"
    if kind == "testid":
        return f"page.getByTestId({_q(spec[1])})"
    raise ValueError(f"unknown locator kind {kind}")


def render_page_object(sample: dict[str, Any]) -> str:
    cls = sample["page_class"]
    lines = [
        "import { type Locator, type Page } from '@playwright/test';",
        "",
        f"/** Page object for {sample['feature']} ({sample['page_path']}). */",
        f"export class {cls} {{",
        "  readonly page: Page;",
    ]
    for name in sample["locators"]:
        lines.append(f"  readonly {name}: Locator;")
    lines += ["", "  constructor(page: Page) {", "    this.page = page;"]
    for name, spec in sample["locators"].items():
        lines.append(f"    this.{name} = {_locator_expr(spec)};")
    lines += [
        "  }",
        "",
        "  async goto() {",
        f"    await this.page.goto({_q(sample['page_path'])});",
        "  }",
        "}",
        "",
    ]
    return "\n".join(lines)


def _render_action(act: list, indent: str) -> list[str]:
    op = act[0]
    if op == "goto":
        return [f"{indent}await app.goto();"]
    if op == "fill":
        val = "`qa+${Date.now()}@example.com`" if act[2] == "@unique_email" else _q(act[2])
        return [f"{indent}await app.{act[1]}.fill({val});"]
    if op == "click":
        return [f"{indent}await app.{act[1]}.click();"]
    if op == "press":
        return [f"{indent}await app.{act[1]}.press({_q(act[2])});"]
    if op == "expectVisible":
        return [f"{indent}await expect(app.{act[1]}).toBeVisible();"]
    if op == "expectText":
        return [f"{indent}await expect(app.{act[1]}).toContainText({_q(act[2])});"]
    if op == "expectUrl":
        return [f"{indent}await expect(page).toHaveURL(/{_re_escape(act[1])}/);"]
    if op == "repeat":
        out = [f"{indent}for (let attempt = 0; attempt < {act[1]}; attempt++) {{"]
        for inner in act[2]:
            out += _render_action(inner, indent + "  ")
        out.append(f"{indent}}}")
        return out
    raise ValueError(f"unknown action {op}")


def render_spec(sample: dict[str, Any], tests: list[dict[str, Any]], use_weak: bool) -> str:
    cls, feature = sample["page_class"], sample["feature"]
    lines = [
        "import { test, expect } from '@playwright/test';",
        f"import {{ {cls} }} from '../pages/{sample['page_file']}';",
        "",
        f"test.describe({_q(feature)}, () => {{",
    ]
    current_ac = None
    for t in sorted(tests, key=lambda x: (x["criterion_id"], x["id"])):
        if t["criterion_id"] != current_ac:
            if current_ac is not None:
                lines.append("")
            current_ac = t["criterion_id"]
            lines.append(f"  // {current_ac}")
        title = f"{t['id']} [{t['type']}] {t['title']}"
        actions = t["weak_actions"] if (use_weak and t.get("weak_actions")) else t["actions"]
        lines.append(f"  test({_q(title)}, async ({{ page }}) => {{")
        lines.append(f"    const app = new {cls}(page);")
        for a in actions:
            lines += _render_action(a, "    ")
        lines.append("  });")
    lines += ["});", ""]
    return "\n".join(lines)


def spec_filename(sample: dict[str, Any]) -> str:
    return f"tests/{sample['id']}.spec.ts"


def render_files(sample: dict[str, Any], tests: list[dict[str, Any]], use_weak: bool) -> list[dict[str, str]]:
    return [
        {"filename": f"pages/{sample['page_file']}.ts", "code": render_page_object(sample)},
        {"filename": spec_filename(sample), "code": render_spec(sample, tests, use_weak)},
    ]
