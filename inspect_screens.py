from bs4 import BeautifulSoup
import os

files = [
    "1_login.html",
    "2_dashboard.html",
    "3_chat.html",
    "4_documents.html",
    "5_clinician_status.html",
    "6_reports.html",
    "7_onboard_org.html"
]

ref_dir = r"d:\AI-Healthcare-Compliance-and-Credential-Verification\FDE_POC2\reference_screens"

for f in files:
    path = os.path.join(ref_dir, f)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fp:
            html = fp.read()
            # print title and major headings or sections
            print(f"=== {f} ({len(html)} bytes) ===")
            import re
            titles = re.findall(r'<h[1-3][^>]*>(.*?)</h[1-3]>', html, re.IGNORECASE | re.DOTALL)
            clean_titles = [re.sub(r'<[^>]+>', '', t).strip() for t in titles]
            print("Headings:", clean_titles[:8])
            # search for main navigation items
            nav_items = re.findall(r'<nav[^>]*>(.*?)</nav>', html, re.IGNORECASE | re.DOTALL)
            if nav_items:
                nav_text = re.sub(r'<[^>]+>', ' ', nav_items[0])
                print("Nav text:", " ".join(nav_text.split())[:120])
