// Import from modules
import { Dispatch, StateUpdater, useEffect, useState } from "preact/hooks";
import { AdrBuilding, DataCenterRackRow, DataCenterRoom } from "../types";
import { useRoomMetadata } from "../api/hooks/materialApi";
import "oj-c/select-single";

import ArrayDataProvider from "ojs/ojarraydataprovider";
import { UseMockData } from "./GraphView";

interface RegionADSiteSelectorsProps {
  rooms?: DataCenterRoom[];
  loading?: boolean;
  selectedRoom: string | undefined;
  setSelectedRoom: Dispatch<StateUpdater<DataCenterRoom | null>>;
}

const emptyDP = new ArrayDataProvider([], { keyAttributes: "value" });
  
const RegionADSiteSelectors = ({
  rooms,
  loading,
  selectedRoom,
  setSelectedRoom,
}: RegionADSiteSelectorsProps) => {
  const { data: adrBuildingData, isFetching: adsLoading } =
    useRoomMetadata(UseMockData);

  const [regionsInfo, setRegionsInfo] =
    useState<ArrayDataProvider<any, any>>(emptyDP);
  const [adsInfo, setAdsInfo] = useState<ArrayDataProvider<any, any>>(emptyDP);
  const [roomToBuildingData, setRoomToBuilding] = useState<{
    [key: string]: string;
  }>({});
  const [roomInfo, setRoomInfo] =
    useState<ArrayDataProvider<any, any>>(emptyDP);
  const [selectedRegion, setSelectedRegion] = useState<string>();
  const [selectedAd, setSelectedAd] = useState<string | null>(null);

  useEffect(() => {
    if (rooms && rooms.length > 0 && !selectedRoom) {
      const roomNamesList: any[] = rooms.map((room) => ({
        label: room.roomName,
        value: room.roomName,
      }));
      const roomNamesListDP = new ArrayDataProvider(roomNamesList, {
        keyAttributes: "value",
      });
      setRoomInfo(roomNamesListDP);
      handleRoomTypeaheadChange(rooms[0], true);
    }
  }, [rooms]);
  const handleRoomTypeaheadChange = (
    roomOnSelect: DataCenterRoom,
    onRoomsUpdate?: boolean
  ) => {
    if (!roomOnSelect) {
      setSelectedRoom(null);
      setSelectedAd("");
      setSelectedRegion("");
      return;
    }
    if (roomOnSelect.roomName === selectedRoom) {
      return;
    }
    setSelectedRoom(roomOnSelect);

    const validRooms =
      rooms?.filter((r) => r.roomName === roomOnSelect.roomName) || [];
    if (validRooms.length == 0) {
      return;
    }
    const rackRows: DataCenterRackRow[] = validRooms[0].rackRows || [];
    if (onRoomsUpdate) {
      const regionName = validRooms[0].region;
      const adName = validRooms[0].availabilityDomain;
      const buildingName = validRooms[0].building;

      if (validRooms.length !== 0) {
        const room: string = validRooms[0].roomName;
        handleBuildingTypeaheadChange(room);
      } else if (regionName && adName && buildingName) {
        setSelectedRegion(regionName);
        setSelectedAd(adName);
      }
    }
  };

  const handleRegionTypeaheadChange = (regionsOnSelect: string) => {
    setSelectedRegion(regionsOnSelect);
    setSelectedAd(null);
    setSelectedRoom(null);
    if (!adrBuildingData) return;

    // Do whatever you need to do with the selected regions
    const validAdrBuildingData = adrBuildingData?.filter(
      (option: AdrBuilding) => typeof option.regionDisplayName === "string"
    );
    if (!regionsOnSelect) {
      setValidAds(validAdrBuildingData);
      setValidRoom(validAdrBuildingData);
      return;
    }
    const regionName = regionsOnSelect;
    const filteredAdrBuildingData = validAdrBuildingData.filter(
      (item: AdrBuilding) => item.regionDisplayName === regionName
    );
    setValidAds(filteredAdrBuildingData);
    setValidRoom(filteredAdrBuildingData);
  };

  const handleADTypeaheadChange = (adsOnSelect: string) => {
    setSelectedAd(adsOnSelect);
    setSelectedRoom(null);

    if (!adrBuildingData || !adsOnSelect) return;

    // Do whatever you need to do with the selected ads
    const validAdrBuildingData = adrBuildingData.filter(
      (option: AdrBuilding) =>
        typeof option.availabilityDomainCanonicalShortCode === "string"
    );
    const filteredAdrBuildingData = validAdrBuildingData.filter(
      (item: AdrBuilding) =>
        item.availabilityDomainCanonicalShortCode === adsOnSelect
    );
    const validRegions = getValidRegions(filteredAdrBuildingData);
    if (!validRegions || validRegions.length === 0) return;
    setSelectedRegion(validRegions[0].value);
    setValidRoom(filteredAdrBuildingData);
  };

  const handleBuildingTypeaheadChange = (roomOnSelect: string) => {
    if (!roomOnSelect) return;
    const validRooms = (
      adrBuildingData?.filter(
        (r: any) => r.roomCanonicalName === roomOnSelect
      ) || []
    ).map((r: any) => {
      return {
        roomName: r.roomCanonicalName,
        building: r.buildingCanonicalName,
        region: r.regionDisplayName,
        availabilityDomain: r.availabilityDomainCanonicalShortCode,
      } as DataCenterRoom;
    });
    if (validRooms.length == 0) {
      return;
    }
    setSelectedRoom(validRooms[0]);

    const room: string = roomOnSelect;
    const building = roomToBuildingData[room];
    // Do whatever you need to do with the selected buildings
    const validAdrBuildingData = adrBuildingData?.filter(
      (option: AdrBuilding) => typeof option.buildingCanonicalName === "string"
    );
    handleRoomTypeaheadChange(validRooms[0], false);

    const filteredAdrBuildingData = validAdrBuildingData?.filter(
      (item: AdrBuilding) => item.buildingCanonicalName === building
    );
    const validRegions = getValidRegions(filteredAdrBuildingData);
    if (!validRegions) return;

    if (validRegions.length !== 0) {
      setSelectedRegion(validRegions[0].value);
    }
    const validAds = getValidAds(filteredAdrBuildingData);
    if (!validAds || validAds.length === 0) return;
    setSelectedAd(validAds[0].value);
  };

  const getValidAds = (
    validAdrBuildingData: readonly AdrBuilding[] | undefined
  ) => {
    if (!validAdrBuildingData) return;
    const ads = validAdrBuildingData
      .map((item) => ({
        label: item.availabilityDomainCanonicalShortCode,
        value: item.availabilityDomainCanonicalShortCode,
      }))
      .filter(
        (ad, index, self) =>
          index === self.findIndex((a) => a.value === ad.value)
      );
    const validAds = ads.filter((option) => typeof option.value === "string");
    return validAds;
  };

  const setValidAds = (
    validAdrBuildingData: readonly AdrBuilding[] | undefined
  ) => {
    const validAds = getValidAds(validAdrBuildingData);
    if (!validAds) return;

    const validAdsDP = new ArrayDataProvider(validAds, {
      keyAttributes: "value",
    });
    setAdsInfo(validAdsDP);
  };

  const getValidRegions = (
    validAdrBuildingData: readonly AdrBuilding[] | undefined
  ) => {
    if (!validAdrBuildingData) return;

    const regions = validAdrBuildingData
      .map((item) => ({
        label: item.regionDisplayName,
        value: item.regionDisplayName,
      }))
      .filter(
        (region, index, self) =>
          index === self.findIndex((r) => r.value === region.value)
      );
    const validRegions = regions.filter(
      (option) => typeof option.value === "string"
    );
    return validRegions;
  };

  const setValidRoom = (
    validAdrBuildingData: readonly AdrBuilding[] | undefined
  ) => {
    if (!validAdrBuildingData) return;

    const room = validAdrBuildingData
      .map((item) => ({
        label: item.roomCanonicalName,
        value: item.roomCanonicalName,
      }))
      .filter(
        (room, index, self) =>
          index === self.findIndex((b) => b.value === room.value)
      );
    const validRoom = room.filter((option) => typeof option.value === "string");
    const validRoomDP = new ArrayDataProvider(validRoom, {
      keyAttributes: "value",
    });
    setRoomInfo(validRoomDP);
  };

  useEffect(() => {
    const roomToBuildingMap: { [key: string]: string } = {};
    adrBuildingData?.forEach((building: AdrBuilding) => {
      roomToBuildingMap[building.roomCanonicalName] =
        building.buildingCanonicalName;
    });

    setRoomToBuilding(roomToBuildingMap);
    const validRegions = getValidRegions(adrBuildingData);
    const validRegionsDP = new ArrayDataProvider(validRegions || [], {
      keyAttributes: "value",
    });
    setRegionsInfo(validRegionsDP);
    setValidAds(adrBuildingData);
    setValidRoom(adrBuildingData);
  }, [adrBuildingData]);

  return (
    <div className="region-dropdown-group">
      <oj-c-select-single
        id="selectedRegion"
        data={regionsInfo}
        itemText="label"
        labelHint="Region"
        placeholder={
          loading || adsLoading ? "Loading..." : "Choose a region..."
        }
        onvalueChanged={(event) =>
          handleRegionTypeaheadChange(event.detail.value)
        }
        value={selectedRegion}
        disabled={loading || adsLoading || (rooms && rooms.length > 0)}
      />

      <oj-c-select-single
        id="selectedAd"
        data={adsInfo}
        itemText="label"
        labelHint="Availability Domain"
        placeholder={
          loading || adsLoading
            ? "Loading..."
            : "Choose a availability domain..."
        }
        onvalueChanged={(event) => handleADTypeaheadChange(event.detail.value)}
        value={selectedAd}
        disabled={loading || adsLoading || (rooms && rooms.length > 0)}
      />
      <oj-c-select-single
        id="selectedRoom"
        data={roomInfo}
        itemText="label"
        labelHint="Site Name"
        placeholder={
          loading || adsLoading ? "Loading..." : "Choose a site name..."
        }
        onvalueChanged={(event) =>
          handleBuildingTypeaheadChange(event.detail.value)
        }
        value={selectedRoom}
        disabled={loading || adsLoading}
      />
    </div>
  );
};

export default RegionADSiteSelectors;
