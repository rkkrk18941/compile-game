"""Crop official printed art into the existing Japanese card UI. Usage: script TTS_DATA_DIR.
The supplied manifest and sheet files are inputs, never fetched or inferred here.
"""
from pathlib import Path
import json,sys,functools
from PIL import Image,ImageDraw,ImageOps
ROOT=Path(__file__).resolve().parents[1];SRC=Path(sys.argv[1]);OUT=ROOT/'ibara';mapping={}
def seq(group,ids):
 for i,id in enumerate(ids.split()):
  if id!='Ticket':mapping.setdefault(id,{'group':group,'index':i})
seq('GD_Starter','CurlUp DefendU DefendU DefendU DefendU StrikeU StrikeU StrikeU StrikeU TwinSlam')
seq('GD_Rewards','OrbSupport ResilientPlate OverloadU PrismaticBarrier PrismaticSpray TuneUp StasisField StrikeForStrike SentryBeam DisruptU ChargeCore ChargeCore CrystalEdge CrystalEdge FierceBash FierceBash OrbSlam OrbSlam HackU HackU PolyBeam PolyBeam PrimingShot PrimingShot GearUp GearUp SphericShield SphericShield Suspension Suspension FortifyU FortifyU WalkerClaw WalkerClaw RollAttack RollAttack Ticket Ticket Orbwalk GuardianWhirl VentSteam Turbocharge SpeedBoost ChargeUpU IncinerateU Crystallize FocusBeam GemCannon HardenU MultiBeam StasisBeam PowerBeam LaserTurret FuturePlans Preprogram BrilliantScales RepulsorU AncientConstruct ShieldCharger TimeSifter ScaleSlash BlitzU')
seq('GD_Rare','BaubleBurst BodyCrash SpikerProtocol EvadeU GigaBeam RevengeProtocol ArmoredProtocol GemFinder ExploitGems StasisEngine ConstructionForm FloatingOrbs TimeCapacitor DestroyU RefractedBeam Forecasting')
seq('HX_Starter','DefendH DefendH DefendH DefendH Kindle Sear StrikeH StrikeH StrikeH StrikeH')
seq('HX_Rewards','AdvancingGuard AdvancingGuard BurningTouch BurningTouch Firestarter Firestarter FlareFlick FlareFlick FleetingFlash FleetingFlash GhostLash GhostLash PremonitionH PremonitionH ShieldOfNight ShieldOfNight SwordOfNight SwordOfNight ThermalTransfer ThermalTransfer GhostShield GhostShield Floatwork Floatwork NightmareStrike NightmareStrike HeatCrush HeatCrush FastForward FastForward Ticket Ticket FloatH HeatMetal WhisperFromBeyond HeatShield FlamesFromBeyond DevourFlame Hexaguard BadOmen CatchUp ChargedBarrage DividerH EmpoweredFlame HauntedHand HauntingEcho LingeringShades LivingBomb NightmareGuise NightmareVision PhantomFireball RainOfEmbers RewindH SearingWound SeventhEye SpectralGrace StokeTheFire TurnItUp VolcanoVisage WorthySacrifice TimeOfNeed')
seq('HX_Rare','DevilsDance BrightRitual Incineration InfernalForm Poltergeist DoomsdayH ForkedFlame PowerFromBeyond StepThrough UnleashSpirits UnlimitedPower ExtraCrispy InstantInferno Incorporeal RadiantReverb EerieExpedition')
seq('HM_Starter','Covet StrikeM StrikeM StrikeM StrikeM StrikeM Snapshot DefendM DefendM DefendM DefendM')
seq('HM_Rewards','Vantage FlashPowder HeroicBravado PistolWhip PistolWhip Misfire Misfire Quickdraw Quickdraw TrackingShots TrackingShots HighCaliber HighCaliber Headshot Headshot ItchyTrigger ItchyTrigger FanTheHammer FanTheHammer Dive Dive Feint Feint TakeCover TakeCover BodyArmor BodyArmor LowProfile LowProfile ManifestM ManifestM ScornM GrudgeM MaliceM UndeadM HorrorM Ticket Ticket FullyLoaded TakeAim EnervateM WideOpen DesperadoM CursedWeapon TrickShot ShortFuse DeadeyeM BrawlM OverwhelmingPower ShowdownM DeterminationM MaintenanceM LoneWolf ShadowCloak CalledShot BlackWind GhostlyPresence SpecterM MidnightM RummageM EyeOfTheStormM VirtueM')
seq('HM_Rare','FatalDesire CheatM MagnumM RoundhouseKickM PurgatoryM GoldenBullet RouletteM NoHoldsBarred EternalForm HighNoonM SnipeM GestaltM DeadOrAlive CoalescenceM SmokingBarrel ComboM')
seq('80fcb6','DfBite DfDeepBreath DfForethought DfJackOfAllTrades DfLastStand DfSecretTechnique DfSecretWeapon DfPanicButton DfRitualDagger DfShapersBlessing DfBloodShots DfChronoboost DfCuriosity DfInvincible DfVirus DfYouAreMine')
seq('5b1766','DfTeleportationStone DfThimbleHelm DfDuelingGlove DfSackOfGems DfBlackPowder DfKunai DfClaspedLocket DfFuelCanister DfSneckoEgg DfGreedOoze DfPotionBelt DfShotGlass DfMakeshiftBattery DfStraightRazor DfUnceasingTop DfPantograph DfBrokenSeal')
seq('d6b384','DfDentedPlate DfWheelOfChange DfKnowingSkull DfBattleBuddies DfForbiddenFruit DfChronometer DfMarkOfPain DfShuriken')
seq('72a869','DfTransformingBrew DfEnergyDrink DfEnergyDrink DfMysteryPotion DfMysteryPotion DfPizzazPotion DfGreedPotion DfLiquidVoid DfFruitJuice DfCleverConcoction DfDestinyDraught DfCultistPotion DfBottleOfNails DfCactusJuice DfWhaleAle')
for i,id in enumerate('DfScatterbrained DfScatterbrained DfIcky DfPride DfNormality DfFlawed DfHaunted DfAged DfForgetful'.split(),13):mapping.setdefault(id,{'group':'9fc22a','index':i})
for g,ids in [('e07486','df-witch df-dark-core df-wrathful'),('f69a29','df-orb-master df-inferno df-trickster'),('2a2330','df-demon df-wraith df-blasphemer'),('18155b','df-corrupted'),('dd3174','df-neow'),('d0c833','df-flame-barrier df-doppelganger'),('e077d5','df-slayer-R df-slayer-G df-slayer-B df-slayer-W')]:seq(g,ids)
for id,g,i in [('df-dark-orb','66fbad',35),('df-lightning-orb','485ed8',32),('df-frost-orb','485ed8',35),('df-enemy-shiv','e49dd1',21)]:mapping[id]={'group':g,'index':i}
idx=json.load(open(SRC/'card-sheet-index.json'));lookup={(x['label'],x['side']):x for x in idx};manifest=json.load(open(SRC/'manifest.json'))
@functools.lru_cache(maxsize=6)
def sheet(name):return Image.open(SRC/'sheets'/name)
def face(spec):
 g,i=spec['group'],spec['index'];key=(f'{g}_{i:02d}','base')
 if key in lookup:x=lookup[key];return sheet(x['sheet']).crop(x['crop_box']).convert('RGB'),x
 d=manifest['decks'][g];cid=d['cards'][i]['cardId'];h=d['sheets'][str(cid//100)];sh=manifest['sheets'][h];im=sheet('sheet_'+h+'.jpg');cw,ch=im.width/sh['w'],im.height/sh['h'];q=cid%100;box=[round(q%sh['w']*cw),round(q//sh['w']*ch),round((q%sh['w']+1)*cw),round((q//sh['w']+1)*ch)]
 return im.crop(box).convert('RGB'),{'sheet':'sheet_'+h+'.jpg','crop_box':box}
def crop(im,box):return im.crop(tuple(round(v*(im.width if j%2==0 else im.height)) for j,v in enumerate(box)))
# Blank frame geometry is shared with the existing cards; all art comes from the exact printed face.
blank=Image.open(OUT/'img/c/StrikeS.webp').convert('RGBA')
colors={'GD':(105,152,202),'HX':(178,101,175),'HM':(201,143,76),'80':(155,155,151),'9f':(106,88,114)}
for id,spec in mapping.items():
 im,source=face(spec);spec.update(source);spec['source_url']=manifest['sheets'][source['sheet'][6:-4]]['url']
 if id.startswith('df-'):
  out=crop(im,(.52,.15,.97,.94)) if im.width>im.height else crop(im,(.12,.12,.89,.67));out.thumbnail((420,500));dest=OUT/'img/enemies'/f'{id}.webp'
 elif spec['group'] in ['5b1766','d6b384','72a869']:
  out=crop(im,(.29,.25,.70,.53));out=ImageOps.fit(out,(96,96));dest=OUT/('img/p' if spec['group']=='72a869' else 'img/r')/f'{id}.webp'
 else:
  tint=colors.get(spec['group'][:2],(150,150,150));lum=ImageOps.grayscale(blank);out=ImageOps.colorize(lum,tuple(int(x*.10) for x in tint),tint).convert('RGBA');out.putalpha(blank.getchannel('A'))
  art=ImageOps.fit(crop(im,(.14,.20,.87,.52)),(258,162));out.paste(art,(40,73));dest=OUT/'img/c'/f'{id}.webp'
 dest.parent.mkdir(exist_ok=True,parents=True);out.save(dest,quality=84,method=2)
(OUT/'DOWNFALL_CARD_SOURCES.json').write_text(json.dumps({'version':'TTS saved 2026-07-23 / rulebook v1.47','faces':mapping},ensure_ascii=False,indent=2)+'\n')
print('generated',len(mapping),'official art assets and source map')
