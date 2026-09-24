import type { Locale } from "@/lib/i18n/dictionaries";

/**
 * Privacy policy and terms of use, in both languages. Plain data rendered by
 * app/(public)/privacy and app/(public)/terms — edit the wording here.
 */
export const LEGAL_UPDATED = new Date("2026-09-24T00:00:00Z");
export const CONTACT_EMAIL = "smati.yassinee@hotmail.com";

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDocument {
  intro: string;
  sections: LegalSection[];
}

const PRIVACY: Record<Locale, LegalDocument> = {
  fr: {
    intro:
      "Résido aide les syndics à gérer les charges, encaissements, dépenses et la trésorerie de leurs résidences. Cette page explique quelles données le service conserve et pourquoi.",
    sections: [
      {
        title: "Données collectées",
        paragraphs: [
          "Votre compte : nom, adresse e-mail et mot de passe. Le mot de passe n'est jamais stocké en clair — seule une empreinte chiffrée (bcrypt) est conservée.",
          "Les données que vous saisissez pour vos résidences : blocs, lots, propriétaires (nom, téléphone facultatif), cycles, paiements, dépenses et notes. Vous êtes responsable de disposer du droit de les enregistrer.",
        ],
      },
      {
        title: "Utilisation",
        paragraphs: [
          "Ces données servent uniquement à faire fonctionner le service : afficher vos résidences, calculer les soldes et produire les exports que vous demandez. Elles ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires.",
        ],
      },
      {
        title: "Cookies",
        paragraphs: [
          "Résido utilise uniquement des cookies nécessaires : un cookie de session pour vous garder connecté, et deux cookies de préférence (langue et thème). Aucun cookie publicitaire ni de mesure d'audience.",
        ],
      },
      {
        title: "Hébergement et sécurité",
        paragraphs: [
          "Les données sont stockées dans une base MongoDB hébergée. Les échanges sont chiffrés (HTTPS) et chaque résidence n'est accessible qu'aux comptes qui y ont été ajoutés.",
        ],
      },
      {
        title: "Conservation et suppression",
        paragraphs: [
          "Les données sont conservées tant que votre compte et vos résidences existent. Supprimer une résidence efface définitivement toutes ses données. Pour supprimer votre compte, écrivez à l'adresse ci-dessous.",
        ],
      },
      {
        title: "Vos droits",
        paragraphs: [
          `Vous pouvez demander l'accès, la rectification ou la suppression de vos données personnelles en écrivant à ${CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  en: {
    intro:
      "Résido helps condominium managers (syndics) track charges, payments, expenses and treasury for their residences. This page explains what data the service keeps and why.",
    sections: [
      {
        title: "Data collected",
        paragraphs: [
          "Your account: name, email address and password. The password is never stored in clear — only a one-way hash (bcrypt) is kept.",
          "The data you enter for your residences: blocks, units, owners (name, optional phone), cycles, payments, expenses and notes. You are responsible for having the right to record it.",
        ],
      },
      {
        title: "How it is used",
        paragraphs: [
          "This data is used only to run the service: showing your residences, computing balances and producing the exports you ask for. It is never sold, rented or used for advertising.",
        ],
      },
      {
        title: "Cookies",
        paragraphs: [
          "Résido only uses necessary cookies: a session cookie to keep you signed in, and two preference cookies (language and theme). No advertising or analytics cookies.",
        ],
      },
      {
        title: "Hosting and security",
        paragraphs: [
          "Data is stored in a hosted MongoDB database. Traffic is encrypted (HTTPS) and each residence is only reachable by the accounts that were added to it.",
        ],
      },
      {
        title: "Retention and deletion",
        paragraphs: [
          "Data is kept for as long as your account and residences exist. Deleting a residence erases all of its data for good. To delete your account, write to the address below.",
        ],
      },
      {
        title: "Your rights",
        paragraphs: [`You can ask to access, correct or delete your personal data by writing to ${CONTACT_EMAIL}.`],
      },
    ],
  },
};

const TERMS: Record<Locale, LegalDocument> = {
  fr: {
    intro: "En créant un compte ou en utilisant Résido, vous acceptez les conditions ci-dessous.",
    sections: [
      {
        title: "Le service",
        paragraphs: [
          "Résido est un outil de gestion de syndic : résidences, lots, propriétaires, cycles de charges, encaissements, dépenses et trésorerie. Il peut évoluer, et des fonctionnalités peuvent être ajoutées, modifiées ou retirées.",
        ],
      },
      {
        title: "Votre compte",
        paragraphs: [
          "Vous devez fournir des informations exactes et garder votre mot de passe confidentiel. Vous êtes responsable de l'activité réalisée depuis votre compte.",
        ],
      },
      {
        title: "Vos données",
        paragraphs: [
          "Les données que vous saisissez restent les vôtres. Vous êtes responsable de leur exactitude et du droit de les enregistrer. Les chiffres affichés sont calculés à partir de vos saisies : vérifiez-les avant toute décision financière ou communication officielle.",
        ],
      },
      {
        title: "Usage acceptable",
        paragraphs: [
          "N'utilisez pas le service à des fins illégales, ne tentez pas d'accéder aux résidences d'autres comptes et ne perturbez pas son fonctionnement.",
        ],
      },
      {
        title: "Responsabilité",
        paragraphs: [
          "Le service est fourni « en l'état », sans garantie de disponibilité continue. Dans les limites permises par la loi, l'éditeur n'est pas responsable des pertes indirectes liées à son utilisation. Conservez vos propres exports pour vos archives.",
        ],
      },
      {
        title: "Modifications et contact",
        paragraphs: [
          `Ces conditions peuvent être mises à jour ; la date en haut de page l'indique. Pour toute question : ${CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  en: {
    intro: "By creating an account or using Résido, you accept the terms below.",
    sections: [
      {
        title: "The service",
        paragraphs: [
          "Résido is a condominium management tool: residences, units, owners, charge cycles, payments, expenses and treasury. It may evolve, and features may be added, changed or removed.",
        ],
      },
      {
        title: "Your account",
        paragraphs: [
          "You must provide accurate information and keep your password confidential. You are responsible for activity carried out from your account.",
        ],
      },
      {
        title: "Your data",
        paragraphs: [
          "The data you enter remains yours. You are responsible for its accuracy and for having the right to record it. Figures shown are computed from what you enter: check them before any financial decision or official communication.",
        ],
      },
      {
        title: "Acceptable use",
        paragraphs: [
          "Do not use the service for unlawful purposes, do not try to reach other accounts' residences, and do not disrupt its operation.",
        ],
      },
      {
        title: "Liability",
        paragraphs: [
          "The service is provided “as is”, with no guarantee of continuous availability. To the extent permitted by law, the publisher is not liable for indirect losses arising from its use. Keep your own exports for your records.",
        ],
      },
      {
        title: "Changes and contact",
        paragraphs: [
          `These terms may be updated; the date at the top of the page shows when. Questions: ${CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
};

export const LEGAL = { privacy: PRIVACY, terms: TERMS };
