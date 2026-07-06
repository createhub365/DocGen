"""Generate complete_trade_bank.json with all industries."""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def responsibilities(trade: str, category: str, context: str) -> list[str]:
    return [
        f"Manage and oversee {trade.lower()} operations and deliverables in accordance with {context} standards and organisational requirements.",
        "Ensure compliance with all applicable legislation including the Health and Safety at Work Act 2015 (HSWA) and relevant industry regulations.",
        f"Collaborate with supervisors, colleagues, and stakeholders to deliver high-quality outcomes within the {category} workstream.",
        "Maintain accurate records, documentation, quality checks, and reporting as required by the employer and regulatory bodies.",
        "Supervise, mentor, and support junior staff, apprentices, and new team members on safe and effective work practices.",
    ]


def duty_templates(trade: str, category: str, legislation: str) -> list[str]:
    role = trade.lower()
    cat = category.lower()
    return [
        f"Perform {role} tasks as directed, following work instructions, site or workplace policies, and {legislation} requirements.",
        f"Read, interpret, and apply procedures, specifications, and checklists relevant to {cat} work in New Zealand workplaces.",
        f"Set up, operate, maintain, and shut down tools, equipment, and systems used in {role} work safely and efficiently.",
        f"Inspect completed work for quality, identify defects or hazards, and carry out corrective actions or escalate non-conformances promptly.",
        f"Coordinate with team members and supervisors to plan daily tasks, manage materials, and meet productivity and safety targets.",
        f"Complete required documentation including timesheets, incident reports, maintenance logs, and compliance records accurately and on time.",
        f"Apply infection prevention, food safety, privacy, or other sector controls where required for {cat} operations.",
        f"Participate in toolbox talks, inductions, audits, and continuous improvement activities relevant to the {role} role.",
        f"Maintain a clean, organised, and secure work area and store tools and materials in accordance with workplace standards.",
        f"Respond to emergencies, faults, or customer needs within scope of training and escalate issues outside competence immediately.",
        f"Use personal protective equipment (PPE) and safe work methods at all times, reporting hazards under HSWA 2015 obligations.",
        f"Support training of new staff and contribute to a positive, respectful, and inclusive team culture on site or in the workplace.",
    ]


def make_trade(trade: str, anzsco_code: str, anzsco_title: str, category: str, context: str, legislation: str = "HSWA 2015") -> dict:
    return {
        "trade": trade,
        "anzsco_code": anzsco_code,
        "anzsco_title": anzsco_title,
        "responsibilities": responsibilities(trade, category, context),
        "duties": duty_templates(trade, category, legislation),
    }


def load_construction_industry() -> dict:
    src = DATA_DIR / "nz_complete_trade_bank.json"
    with open(src, encoding="utf-8") as f:
        old = json.load(f)

    categories = []
    for cat in old["categories"]:
        trades = []
        for t in cat["trades"]:
            trades.append({
                "trade": t["trade"],
                "anzsco_code": t["anzsco_code"],
                "anzsco_title": t["anzsco_title"],
                "responsibilities": responsibilities(
                    t["trade"], cat["category"], "New Zealand construction and infrastructure"
                ),
                "duties": t["duties"],
            })
        categories.append({"category": cat["category"], "trades": trades})

    return {
        "industry": "Construction & Infrastructure",
        "icon": "🏗️",
        "color": "#1A3C5E",
        "countries": ["New Zealand", "Australia", "UAE", "Jordan", "UK", "Canada"],
        "categories": categories,
    }


def other_industries() -> list[dict]:
    ctx = {
        "Healthcare & Medical": ("healthcare and clinical", "Health and Disability Services standards and HSWA 2015"),
        "Agriculture & Primary": ("primary production and rural", "HSWA 2015 and primary sector codes of practice"),
        "Hospitality & Tourism": ("hospitality and customer service", "Food Act 2014 and HSWA 2015"),
        "Logistics & Supply Chain": ("logistics and supply chain", "HSWA 2015 and transport regulations"),
        "Manufacturing & Industrial": ("manufacturing and production", "HSWA 2015 and quality management systems"),
        "Energy & Resources": ("energy and resources", "HSWA 2015 and major hazard facility requirements"),
        "IT & Technology": ("information technology", "Privacy Act 2020 and organisational security policies"),
        "Aged Care & Disability": ("aged care and disability support", "Health and Disability Services Act and HSWA 2015"),
        "Education & Training": ("education and training", "Education and Training Act 2020 and HSWA 2015"),
        "Security & Safety": ("security and workplace safety", "HSWA 2015 and security industry licensing requirements"),
        "Retail & Consumer": ("retail and consumer services", "Fair Trading Act and HSWA 2015"),
    }

    specs = [
        {
            "industry": "Healthcare & Medical",
            "icon": "🏥",
            "color": "#0D7C4A",
            "countries": ["New Zealand", "Australia", "UAE", "UK", "Canada"],
            "categories": [
                ("Clinical & Nursing", [
                    ("Registered Nurse", "254411", "Registered Nurse"),
                    ("Enrolled Nurse", "254412", "Enrolled Nurse"),
                    ("Midwife", "254111", "Midwife"),
                    ("Theatre Nurse", "254413", "Theatre Nurse"),
                    ("ICU / Critical Care Nurse", "254414", "ICU / Critical Care Nurse"),
                ]),
                ("Allied Health", [
                    ("Physiotherapist", "252511", "Physiotherapist"),
                    ("Occupational Therapist", "252411", "Occupational Therapist"),
                    ("Radiographer", "251211", "Radiographer"),
                    ("Medical Laboratory Technician", "311213", "Medical Laboratory Technician"),
                    ("Sonographer", "251212", "Sonographer"),
                ]),
                ("Medical Support", [
                    ("Healthcare Assistant", "423111", "Healthcare Assistant"),
                    ("Aged Care Worker", "423111", "Aged Care Worker"),
                    ("Disability Support Worker", "423112", "Disability Support Worker"),
                    ("Medical Receptionist", "542113", "Medical Receptionist"),
                ]),
                ("Pharmacy", [
                    ("Pharmacist", "251511", "Pharmacist"),
                    ("Pharmacy Technician", "311215", "Pharmacy Technician"),
                ]),
            ],
        },
        {
            "industry": "Agriculture & Primary",
            "icon": "🌾",
            "color": "#2D6A4F",
            "countries": ["New Zealand", "Australia", "UAE", "UK", "Canada"],
            "categories": [
                ("Horticulture", [
                    ("Fruit Picker / Orchard Worker", "121311", "Fruit Picker"),
                    ("Vineyard Worker / Viticulture", "121312", "Vineyard Worker"),
                    ("Greenhouse Grower", "121313", "Greenhouse Grower"),
                    ("Nursery Worker", "362213", "Nursery Worker"),
                ]),
                ("Dairy & Livestock", [
                    ("Dairy Farm Worker", "121111", "Dairy Farm Worker"),
                    ("Livestock Handler", "121211", "Livestock Handler"),
                    ("Farm Manager", "121312", "Farm Manager"),
                    ("Shearing / Shearer", "121221", "Shearer"),
                ]),
                ("Aquaculture & Fishing", [
                    ("Aquaculture Worker", "121411", "Aquaculture Worker"),
                    ("Fishing Deckhand", "899212", "Fishing Deckhand"),
                    ("Mussel / Oyster Farm Worker", "121412", "Mussel / Oyster Farm Worker"),
                ]),
                ("Forestry", [
                    ("Forestry Worker", "821911", "Forestry Worker"),
                    ("Tree Faller / Logger", "821912", "Tree Faller"),
                    ("Arborist", "362211", "Arborist"),
                ]),
            ],
        },
        {
            "industry": "Hospitality & Tourism",
            "icon": "🍽️",
            "color": "#B7950B",
            "countries": ["New Zealand", "Australia", "UAE", "UK", "Canada"],
            "categories": [
                ("Food & Beverage", [
                    ("Chef", "351311", "Chef"),
                    ("Cook", "351411", "Cook"),
                    ("Kitchen Hand", "851111", "Kitchen Hand"),
                    ("Barista", "431511", "Barista"),
                    ("Waiter / Food & Beverage Attendant", "431511", "Food and Beverage Attendant"),
                    ("Restaurant Manager", "141111", "Restaurant Manager"),
                ]),
                ("Accommodation", [
                    ("Hotel Receptionist", "542114", "Hotel Receptionist"),
                    ("Housekeeping Attendant", "422111", "Housekeeping Attendant"),
                    ("Front Office Manager", "141311", "Front Office Manager"),
                    ("Concierge", "431111", "Concierge"),
                ]),
                ("Events & Catering", [
                    ("Event Coordinator", "149311", "Event Coordinator"),
                    ("Banquet Server", "431512", "Banquet Server"),
                    ("Catering Manager", "141111", "Catering Manager"),
                ]),
            ],
        },
        {
            "industry": "Logistics & Supply Chain",
            "icon": "🚛",
            "color": "#1B4F72",
            "countries": ["New Zealand", "Australia", "UAE", "UK", "Canada"],
            "categories": [
                ("Warehousing", [
                    ("Warehouse Worker", "741111", "Warehouse Worker"),
                    ("Forklift Operator", "741111", "Forklift Operator"),
                    ("Inventory Controller", "591211", "Inventory Controller"),
                    ("Warehouse Supervisor", "741112", "Warehouse Supervisor"),
                    ("Pick & Pack Worker", "741113", "Pick and Pack Worker"),
                ]),
                ("Transport & Freight", [
                    ("Truck Driver Heavy", "733111", "Heavy Truck Driver"),
                    ("Truck Driver Light", "733112", "Light Truck Driver"),
                    ("Delivery Driver", "733212", "Delivery Driver"),
                    ("Transport Manager", "149312", "Transport Manager"),
                    ("Dispatcher", "591112", "Dispatcher"),
                ]),
                ("Shipping & Maritime", [
                    ("Stevedore / Wharf Worker", "741211", "Stevedore"),
                    ("Ship Crew / Deck Hand", "899211", "Ship Crew"),
                    ("Port Operations Worker", "741212", "Port Operations Worker"),
                ]),
                ("Cold Chain", [
                    ("Refrigerated Transport Driver", "733113", "Refrigerated Transport Driver"),
                    ("Cold Store Worker", "741114", "Cold Store Worker"),
                ]),
            ],
        },
        {
            "industry": "Manufacturing & Industrial",
            "icon": "🏭",
            "color": "#6C3483",
            "countries": ["New Zealand", "Australia", "UAE", "UK", "Canada"],
            "categories": [
                ("Food Manufacturing", [
                    ("Food Processing Worker", "831211", "Food Processing Worker"),
                    ("Meat Processor", "831212", "Meat Processor"),
                    ("Dairy Production Operator", "831213", "Dairy Production Operator"),
                    ("Quality Control Inspector", "311411", "Quality Control Inspector"),
                ]),
                ("General Manufacturing", [
                    ("Production Operator", "839311", "Production Operator"),
                    ("Machine Operator", "712911", "Machine Operator"),
                    ("Assembly Line Worker", "839312", "Assembly Line Worker"),
                    ("Manufacturing Supervisor", "839313", "Manufacturing Supervisor"),
                ]),
                ("Pharmaceutical", [
                    ("Pharmaceutical Production", "311216", "Pharmaceutical Production Worker"),
                    ("Clean Room Technician", "311217", "Clean Room Technician"),
                    ("Quality Assurance Officer", "311411", "Quality Assurance Officer"),
                ]),
            ],
        },
        {
            "industry": "Energy & Resources",
            "icon": "⚡",
            "color": "#922B21",
            "countries": ["New Zealand", "Australia", "UAE", "UK", "Canada"],
            "categories": [
                ("Oil & Gas", [
                    ("Drilling Technician", "712311", "Drilling Technician"),
                    ("Process Operator", "399511", "Process Operator"),
                    ("Petroleum Engineer", "233112", "Petroleum Engineer"),
                    ("HSE Officer", "251312", "HSE Officer"),
                    ("Maintenance Technician", "342211", "Maintenance Technician"),
                ]),
                ("Renewable Energy", [
                    ("Solar Installer", "342111", "Solar Installer"),
                    ("Wind Turbine Technician", "342113", "Wind Turbine Technician"),
                    ("Energy Auditor", "233914", "Energy Auditor"),
                ]),
                ("Mining", [
                    ("Underground Miner", "712211", "Underground Miner"),
                    ("Open Cut Miner", "712212", "Open Cut Miner"),
                    ("Mining Engineer", "233611", "Mining Engineer"),
                    ("Explosives Handler", "712213", "Explosives Handler"),
                ]),
            ],
        },
        {
            "industry": "IT & Technology",
            "icon": "💻",
            "color": "#1A5276",
            "countries": ["New Zealand", "Australia", "UAE", "UK", "Canada"],
            "categories": [
                ("Software Development", [
                    ("Software Developer", "261312", "Software Developer"),
                    ("Frontend Developer", "261313", "Frontend Developer"),
                    ("Backend Developer", "261314", "Backend Developer"),
                    ("Full Stack Developer", "261315", "Full Stack Developer"),
                    ("Mobile App Developer", "261316", "Mobile App Developer"),
                ]),
                ("Infrastructure & Networks", [
                    ("Network Engineer", "263211", "Network Engineer"),
                    ("Systems Administrator", "262111", "Systems Administrator"),
                    ("Cloud Engineer", "263212", "Cloud Engineer"),
                    ("DevOps Engineer", "263213", "DevOps Engineer"),
                    ("Cybersecurity Analyst", "262112", "Cybersecurity Analyst"),
                ]),
                ("Data & Analytics", [
                    ("Data Analyst", "224711", "Data Analyst"),
                    ("Data Engineer", "262113", "Data Engineer"),
                    ("Business Intelligence", "224712", "Business Intelligence Analyst"),
                    ("Machine Learning Engineer", "262114", "Machine Learning Engineer"),
                ]),
            ],
        },
        {
            "industry": "Aged Care & Disability",
            "icon": "👴",
            "color": "#4A235A",
            "countries": ["New Zealand", "Australia", "UAE", "UK", "Canada"],
            "categories": [
                ("Residential Care", [
                    ("Aged Care Worker", "423111", "Aged Care Worker"),
                    ("Disability Support Worker", "423112", "Disability Support Worker"),
                    ("Personal Care Assistant", "423113", "Personal Care Assistant"),
                    ("Dementia Care Worker", "423114", "Dementia Care Worker"),
                ]),
                ("Community Care", [
                    ("Community Support Worker", "411716", "Community Support Worker"),
                    ("Home Care Worker", "411711", "Home Care Worker"),
                    ("Support Coordinator", "411712", "Support Coordinator"),
                ]),
            ],
        },
        {
            "industry": "Education & Training",
            "icon": "🏫",
            "color": "#1E8449",
            "countries": ["New Zealand", "Australia", "UAE", "UK", "Canada"],
            "categories": [
                ("Teaching", [
                    ("Early Childhood Teacher", "241111", "Early Childhood Teacher"),
                    ("Primary School Teacher", "241213", "Primary School Teacher"),
                    ("Secondary Teacher", "241411", "Secondary Teacher"),
                    ("Special Education Teacher", "241511", "Special Education Teacher"),
                    ("ESOL / English Teacher", "241511", "ESOL Teacher"),
                ]),
                ("Training & Development", [
                    ("Corporate Trainer", "223311", "Corporate Trainer"),
                    ("Vocational Trainer", "242111", "Vocational Trainer"),
                    ("Training Coordinator", "224712", "Training Coordinator"),
                ]),
            ],
        },
        {
            "industry": "Security & Safety",
            "icon": "🔒",
            "color": "#2C3E50",
            "countries": ["New Zealand", "Australia", "UAE", "UK", "Canada"],
            "categories": [
                ("Security Services", [
                    ("Security Guard", "442111", "Security Guard"),
                    ("Armed Security Officer", "442112", "Armed Security Officer"),
                    ("CCTV Operator", "442113", "CCTV Operator"),
                    ("Loss Prevention Officer", "442114", "Loss Prevention Officer"),
                    ("Security Supervisor", "442115", "Security Supervisor"),
                ]),
                ("Safety", [
                    ("HSE Officer", "251312", "HSE Officer"),
                    ("Fire Safety Officer", "312911", "Fire Safety Officer"),
                    ("Emergency Response Officer", "441111", "Emergency Response Officer"),
                ]),
            ],
        },
        {
            "industry": "Retail & Consumer",
            "icon": "🛒",
            "color": "#6E2F1A",
            "countries": ["New Zealand", "Australia", "UAE", "UK", "Canada"],
            "categories": [
                ("Retail Operations", [
                    ("Retail Sales Assistant", "621111", "Retail Sales Assistant"),
                    ("Retail Supervisor", "621112", "Retail Supervisor"),
                    ("Store Manager", "142111", "Store Manager"),
                    ("Visual Merchandiser", "621511", "Visual Merchandiser"),
                ]),
                ("Specialty Retail", [
                    ("Pharmacy Assistant", "311215", "Pharmacy Assistant"),
                    ("Electronics Sales", "621113", "Electronics Salesperson"),
                    ("Fashion Retail", "621114", "Fashion Retail Assistant"),
                ]),
            ],
        },
    ]

    industries = []
    for spec in specs:
        industry_name = spec["industry"]
        context, legislation = ctx[industry_name]
        categories = []
        for cat_name, trades in spec["categories"]:
            categories.append({
                "category": cat_name,
                "trades": [
                    make_trade(t, code, title, cat_name, context, legislation)
                    for t, code, title in trades
                ],
            })
        industries.append({
            "industry": industry_name,
            "icon": spec["icon"],
            "color": spec["color"],
            "countries": spec["countries"],
            "categories": categories,
        })
    return industries


def main() -> None:
    industries = [load_construction_industry(), *other_industries()]
    total = sum(
        len(t)
        for ind in industries
        for cat in ind["categories"]
        for t in [cat["trades"]]
    )
    payload = {
        "meta": {
            "version": "3.0",
            "last_updated": "2025",
            "total_industries": len(industries),
            "total_trades": total,
        },
        "industries": industries,
    }
    out = DATA_DIR / "complete_trade_bank.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    print(f"Wrote {out} — {len(industries)} industries, {total} trades")


if __name__ == "__main__":
    main()
